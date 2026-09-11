const Center = require('../models/Center');
const Order = require('../models/Order');
const Job = require('../models/Job');
const JobItem = require('../models/JobItem');
const PricingRule = require('../models/PricingRule');
const Payment = require('../models/Payment');
const storageService = require('../services/storageService');
const razorpayService = require('../services/razorpayService');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const crypto = require('crypto');

class OrderController {
  /**
   * Generates an authoritative server-side pricing quote
   * POST /api/v1/orders/quote
   */
  async getQuote(req, res) {
    try {
      const { serviceType = 'PASSPORT_PHOTO', quantity, centerId, qrToken } = req.body;
      const normalizedServiceType = (serviceType === 'PASSPORT_4X6' || !serviceType) ? 'PASSPORT_PHOTO' : serviceType;

      if (!quantity || quantity < 1) {
        return ApiResponse.error(res, 'Quantity must be at least 1', 400);
      }

      // 1. Resolve Center
      let center = null;
      if (qrToken) {
        center = await Center.findOne({ qrToken, status: 'ACTIVE' });
      } else if (centerId) {
        center = await Center.findById(centerId);
      } else {
        // Fallback to default active center
        center = await Center.findOne({ status: 'ACTIVE' });
      }

      if (!center) {
        return ApiResponse.error(res, 'Center not found or currently inactive', 404);
      }

      const settings = center.serviceSettings || {
        serviceEnabled: true,
        pricePerPhoto: 7,
        minimumQuantity: 3,
        maximumQuantity: 20,
        quantityStep: 1,
        onlinePaymentEnabled: true,
        cashPaymentEnabled: true
      };

      if (!settings.serviceEnabled) {
        return ApiResponse.error(res, 'Photo printing service is currently disabled for this center', 400);
      }

      // 2. Validate Quantity against min/max/step
      const min = settings.minimumQuantity || 1;
      const max = settings.maximumQuantity || 64;
      const step = settings.quantityStep || 1;

      if (quantity < min || quantity > max) {
        return ApiResponse.error(res, `Quantity must be between ${min} and ${max}`, 400);
      }

      if ((quantity - min) % step !== 0) {
        return ApiResponse.error(res, `Quantity must be a valid step of ${step} starting from ${min}`, 400);
      }

      // 3. Calculate Authoritative Amounts
      const unitPrice = settings.pricePerPhoto || 7;
      const subtotal = unitPrice * quantity;
      const platformFee = 2; // Fixed ₹2 platform fee per order
      const gatewayFee = 0;
      const totalAmount = subtotal + platformFee + gatewayFee;
      const creditCost = quantity * 2; // Fixed 2 credits per photo for CSC operator

      return ApiResponse.success(res, {
        centerId: center._id,
        centerName: center.centerName,
        centerCode: center.centerCode,
        serviceType: normalizedServiceType,
        unitPrice,
        quantity,
        subtotal,
        platformFee,
        gatewayFee,
        totalAmount,
        creditCost,
        onlinePaymentEnabled: settings.onlinePaymentEnabled !== false,
        cashPaymentEnabled: settings.cashPaymentEnabled !== false
      }, 'Authoritative quote calculated');
    } catch (err) {
      logger.error(`[OrderController] Quote calculation error: ${err.message}`);
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Creates a multi-photo customer order with Job and JobItems
   * POST /api/v1/orders/create
   */
  async createOrder(req, res) {
    try {
      const {
        centerId,
        qrToken,
        customerName,
        customerPhone,
        customerEmail,
        serviceType = 'PASSPORT_PHOTO',
        quantity,
        photos = [], // Array of { storageKey, photoUrl, originalFileName, cropSettings, backgroundColor, copies }
        paymentMethod = 'RAZORPAY',
        storageKey, // legacy fallback for single photo
        photoUrl,
        cropSettings,
        backgroundColor
      } = req.body;

      const finalCustomerName = (customerName && customerName.trim()) ? customerName.trim() : 'Walk-in Customer';
      const finalCustomerPhone = (customerPhone && customerPhone.trim()) ? customerPhone.trim() : `99999${Date.now().toString().slice(-5)}`;
      const normalizedServiceType = (serviceType === 'PASSPORT_4X6' || !serviceType) ? 'PASSPORT_PHOTO' : serviceType;

      // 1. Resolve Center
      let center = null;
      if (qrToken) {
        center = await Center.findOne({ qrToken, status: 'ACTIVE' });
      } else if (centerId) {
        center = await Center.findById(centerId);
      }

      if (!center) {
        return ApiResponse.error(res, 'Selected studio center not found or inactive', 404);
      }

      // 2. Resolve Multi-photo items
      let resolvedPhotos = [...photos];
      if (resolvedPhotos.length === 0 && storageKey) {
        resolvedPhotos.push({
          storageKey,
          photoUrl,
          originalFileName: 'photo.jpg',
          cropSettings,
          backgroundColor: backgroundColor || '#FFFFFF',
          copies: quantity || 8
        });
      }

      const totalQuantity = quantity || resolvedPhotos.reduce((sum, p) => sum + (p.copies || 1), 0) || 1;

      // 3. Authoritative Quote Calculation
      const settings = center.serviceSettings || {
        serviceEnabled: true,
        pricePerPhoto: 7,
        minimumQuantity: 1,
        maximumQuantity: 64,
        quantityStep: 1
      };

      const unitPrice = settings.pricePerPhoto || 7;
      const subtotal = unitPrice * totalQuantity;
      const platformFee = 2; // Fixed ₹2 fee
      const totalAmount = subtotal + platformFee;
      const creditCost = totalQuantity * 2; // 2 credits/photo

      // 4. Generate unique IDs
      const uniqueSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      const orderId = `PID-${new Date().getFullYear()}-${uniqueSuffix}`;
      const jobCode = `PIP-${new Date().getFullYear()}-${uniqueSuffix}`;
      const trackingPin = Math.floor(1000 + Math.random() * 9000).toString();

      // 5. Create Job Record (Ready for instant desktop & web pickup)
      const job = await Job.create({
        jobCode,
        centerId: center._id,
        serviceType: normalizedServiceType,
        serviceName: normalizedServiceType === 'PASSPORT_PHOTO' ? 'Indian Passport (35x45mm)' : normalizedServiceType,
        customerName: finalCustomerName,
        customerPhone: finalCustomerPhone,
        customerEmail: customerEmail || `${finalCustomerPhone}@primeidpro.customer`,
        copies: totalQuantity,
        priceInr: totalAmount,
        creditRateSnapshot: 2,
        creditCost,
        jobStatus: 'QUEUED',
        paymentStatus: paymentMethod === 'CASH' ? 'CASH_PENDING' : 'PENDING',
        itemsCount: resolvedPhotos.length,
        itemsData: resolvedPhotos,
        temporaryStorageKey: resolvedPhotos[0]?.storageKey || storageKey || '',
        temporaryPhotoUrl: resolvedPhotos[0]?.photoUrl || photoUrl || '',
        cropSettings: resolvedPhotos[0]?.cropSettings || cropSettings,
        backgroundColor: resolvedPhotos[0]?.backgroundColor || backgroundColor || '#FFFFFF',
        trackingPin,
        photoExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000)
      });

      // 6. Create JobItem records for each photo
      for (let i = 0; i < resolvedPhotos.length; i++) {
        const item = resolvedPhotos[i];
        await JobItem.create({
          jobId: job._id,
          photoIndex: i + 1,
          originalFileName: item.originalFileName || `photo_${i + 1}.jpg`,
          storageKey: item.storageKey,
          photoUrl: item.photoUrl,
          cropSettings: item.cropSettings,
          backgroundColor: item.backgroundColor || '#FFFFFF',
          copies: item.copies || 1,
          status: 'PENDING'
        });
      }

      // 7. Create Order Record
      const order = await Order.create({
        orderId,
        centerId: center._id,
        customerName,
        customerPhone,
        customerEmail,
        qrTokenReference: qrToken || '',
        jobId: job._id,
        serviceType,
        serviceName: job.serviceName,
        quantity: totalQuantity,
        unitPriceSnapshot: unitPrice,
        platformFee,
        gatewayFee: 0,
        subtotal,
        totalAmount,
        paymentMethod,
        paymentStatus: paymentMethod === 'CASH' ? 'CASH_PENDING' : 'PENDING',
        orderStatus: 'CREATED',
        trackingPin
      });

      // Link Order to Job
      job.orderId = order._id;
      job.addStatusHistory('CREATED', 'Order placed by customer', 'CUSTOMER');
      await job.save();

      // Claim all uploaded photos in UploadSession
      for (const item of resolvedPhotos) {
        if (item.storageKey) {
          await storageService.claimUploadSession(item.storageKey, {
            jobId: job._id,
            orderId: order._id,
            centerId: center._id
          });
        }
      }

      // 8. Create Razorpay Order if online payment
      let razorpayOrderData = null;
      if (paymentMethod === 'RAZORPAY') {
        const rzpOrder = await razorpayService.createOrder({
          amountInr: totalAmount,
          receiptId: orderId,
          notes: {
            orderId,
            jobId: job._id.toString(),
            centerId: center._id.toString(),
            customerName
          }
        });

        if (rzpOrder && rzpOrder.id) {
          razorpayOrderData = {
            orderId: rzpOrder.id,
            id: rzpOrder.id,
            amount: rzpOrder.amount,
            currency: rzpOrder.currency,
            keyId: razorpayService.keyId,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            customerEmail: order.customerEmail
          };
          order.razorpayOrderId = rzpOrder.id;
          job.razorpayOrderId = rzpOrder.id;
          await order.save();
          await job.save();

          await Payment.create({
            razorpayOrderId: rzpOrder.id,
            paymentType: 'CUSTOMER_ORDER',
            orderId: order._id,
            centerId: center._id,
            amount: totalAmount,
            currency: rzpOrder.currency || 'INR',
            status: 'PENDING'
          });
        }
      }

      logger.info(`[OrderController] Order created: ${orderId} (Job: ${jobCode}) for Center: ${center.centerCode}. Total: ₹${totalAmount}`);

      const orderData = {
        id: order._id,
        orderId: order.orderId,
        jobCode: job.jobCode,
        trackingPin: order.trackingPin,
        customerName: order.customerName,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        centerName: center.centerName,
        serviceName: order.serviceName,
        quantity: order.quantity
      };

      const jobData = {
        id: job._id,
        jobId: job._id,
        jobCode: job.jobCode,
        customerName: job.customerName,
        serviceName: job.serviceName,
        copies: job.copies,
        priceInr: job.priceInr,
        jobStatus: job.jobStatus,
        trackingPin: job.trackingPin
      };

      return ApiResponse.created(res, {
        order: orderData,
        job: jobData,
        razorpayOrder: razorpayOrderData
      }, 'Order created successfully');
    } catch (err) {
      logger.error(`[OrderController] Order creation error: ${err.message}`);
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Tracks an order with milestones
   * GET /api/v1/orders/track/:orderId
   */
  async trackOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { pin } = req.query;

      const order = await Order.findOne({
        $or: [{ orderId: orderId.toUpperCase() }, { trackingPin: orderId }]
      }).populate('centerId', 'centerName centerCode address city phone');

      if (!order) {
        return ApiResponse.error(res, 'Order not found with provided tracking ID', 404);
      }

      // Optional PIN verification if provided
      if (pin && order.trackingPin !== pin) {
        return ApiResponse.error(res, 'Invalid 4-digit tracking PIN', 403);
      }

      const job = await Job.findById(order.jobId);

      // Build Safe Public Milestones
      const milestones = [
        {
          step: 1,
          name: 'Order Created',
          status: 'COMPLETED',
          time: order.createdAt
        },
        {
          step: 2,
          name: 'Payment Confirmed',
          status: order.paymentStatus === 'PAID' ? 'COMPLETED' : order.paymentStatus === 'CASH_PENDING' ? 'CASH_PENDING' : 'PENDING',
          time: order.cashReceivedAt || (order.paymentStatus === 'PAID' ? order.updatedAt : null)
        },
        {
          step: 3,
          name: 'Queued for Center',
          status: ['QUEUED', 'SENT_TO_APP', 'ACKNOWLEDGED', 'DOWNLOADING', 'PROCESSING', 'READY', 'PRINTING', 'COMPLETED'].includes(job?.jobStatus) ? 'COMPLETED' : 'PENDING',
          time: job?.createdAt
        },
        {
          step: 4,
          name: 'Processing in Prime ID Pro',
          status: ['PROCESSING', 'READY', 'PRINTING', 'COMPLETED'].includes(job?.jobStatus) ? 'COMPLETED' : ['DOWNLOADING', 'ACKNOWLEDGED'].includes(job?.jobStatus) ? 'IN_PROGRESS' : 'PENDING',
          time: job?.claimedAt
        },
        {
          step: 5,
          name: 'Printing & Ready for Pickup',
          status: job?.jobStatus === 'COMPLETED' ? 'COMPLETED' : job?.jobStatus === 'PRINTING' ? 'IN_PROGRESS' : 'PENDING',
          time: job?.completedAt
        }
      ];

      return ApiResponse.success(res, {
        orderId: order.orderId,
        jobCode: job?.jobCode,
        customerName: order.customerName,
        serviceName: order.serviceName,
        quantity: order.quantity,
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        orderStatus: order.orderStatus,
        jobStatus: job?.jobStatus || 'CREATED',
        center: {
          centerName: order.centerId?.centerName,
          centerCode: order.centerId?.centerCode,
          address: order.centerId?.address,
          city: order.centerId?.city,
          phone: order.centerId?.phone
        },
        milestones,
        isCompleted: job?.jobStatus === 'COMPLETED',
        createdAt: order.createdAt
      }, 'Order tracking information retrieved');
    } catch (err) {
      logger.error(`[OrderController] Track order error: ${err.message}`);
      return ApiResponse.error(res, err.message, 500);
    }
  }
}

module.exports = new OrderController();
