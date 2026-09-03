import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  fetchCreditStatus,
  deductCreditsApi,
  connectOnlineAccountApi,
  disconnectOnlineAccountApi,
} from '../services/creditApi';

const CreditContext = createContext(null);

export function CreditProvider({ children }) {
  const [credits, setCredits] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState(null);
  const [licenseKey, setLicenseKey] = useState(null);
  const [tier, setTier] = useState('UNCONNECTED');
  const [rates, setRates] = useState({ passportPhotoPrint: 2, idCardPrintPerUnit: 5 });
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [modalReason, setModalReason] = useState('');

  const refreshCredits = useCallback(async () => {
    try {
      const data = await fetchCreditStatus();
      if (data) {
        const connected = Boolean(data.isConnected);
        setCredits(data.credits ?? 0);
        setIsConnected(connected);
        setConnectedAccount(data.connectedAccount || null);
        setLicenseKey(data.licenseKey || null);
        setTier(data.tier || 'UNCONNECTED');
        if (data.rates) setRates(data.rates);

        // Mandatory first-time connect enforcement
        if (!connected) {
          setShowConnectModal(true);
        }
      }
    } catch (err) {
      console.error('Failed to fetch credit status:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and continuous live sync with web platform
  useEffect(() => {
    refreshCredits();
    const interval = setInterval(refreshCredits, 8000); // 8s live balance sync
    return () => clearInterval(interval);
  }, [refreshCredits]);

  const openConnectModal = (reason = '') => {
    setModalReason(reason);
    setShowConnectModal(true);
  };

  const closeConnectModal = () => {
    if (!isConnected) {
      // Cannot dismiss if account connection is mandatory
      return;
    }
    setShowConnectModal(false);
    setModalReason('');
  };

  /**
   * Safe credit deduction checker.
   * If balance is sufficient, deducts credits and returns true.
   * If insufficient or unconnected, opens the connect modal and returns false.
   */
  const consumeCredits = async ({ type, count = 1, description = '' }) => {
    if (!isConnected) {
      openConnectModal('Account Connection Required! Please connect your PrimeIDPro.online account to print or download.');
      return false;
    }

    const required = type === 'passport' ? rates.passportPhotoPrint * count : rates.idCardPrintPerUnit * count;

    if (credits < required) {
      openConnectModal(
        `Insufficient Token Balance! ${required} tokens required (${
          type === 'passport' ? `${count} Passport Sheet` : `${count} ID Card${count > 1 ? 's' : ''}`
        }). Available: ${credits} tokens. Please recharge on PrimeIDPro.online to continue.`
      );
      return false;
    }

    try {
      const res = await deductCreditsApi({ type, count, description });
      if (res?.success) {
        setCredits(res.remainingCredits);
        return true;
      }
      return false;
    } catch (err) {
      const detail = err.response?.data?.detail;
      const message = typeof detail === 'object' ? detail.message : detail || 'Payment required.';
      openConnectModal(message);
      return false;
    }
  };

  const connectAccount = async ({ accountId, licenseKey }) => {
    const res = await connectOnlineAccountApi({ accountId, licenseKey });
    await refreshCredits();
    setShowConnectModal(false);
    return res;
  };

  const disconnectAccount = async () => {
    const res = await disconnectOnlineAccountApi();
    await refreshCredits();
    return res;
  };

  return (
    <CreditContext.Provider
      value={{
        credits,
        isConnected,
        connectedAccount,
        licenseKey,
        tier,
        rates,
        isLoading,
        showConnectModal,
        modalReason,
        openConnectModal,
        closeConnectModal,
        refreshCredits,
        consumeCredits,
        connectAccount,
        disconnectAccount,
      }}
    >
      {children}
    </CreditContext.Provider>
  );
}

export function useCredits() {
  const context = useContext(CreditContext);
  if (!context) {
    throw new Error('useCredits must be used within a CreditProvider');
  }
  return context;
}
