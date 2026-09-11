const AnalyticsEvent = require('../models/AnalyticsEvent');

exports.syncAnalytics = async (req, res) => {
  try {
    const { eventType, eventId, accountId, installationId, centerId, timestamp, ...payload } = req.body;

    if (!eventId || !eventType) {
      return res.status(400).json({ success: false, message: 'Missing eventId or eventType' });
    }

    // Upsert to handle idempotent retries
    await AnalyticsEvent.findOneAndUpdate(
      { eventId },
      {
        eventType,
        accountId,
        installationId,
        centerId,
        payload,
        createdAt: timestamp ? new Date(timestamp) : new Date()
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Event synced successfully' });
  } catch (error) {
    console.error('Error syncing analytics:', error);
    res.status(500).json({ success: false, message: 'Failed to sync event', error: error.message });
  }
};

exports.getAbandonmentMetrics = async (req, res) => {
  try {
    // Requires superadmin privileges in real app, assuming middleware handles auth

    // Aggregate drop-offs per user/center
    const metrics = await AnalyticsEvent.aggregate([
      {
        $match: {
          eventType: { $in: ['AI_PROCESSED', 'PRINTED', 'SCREENSHOT_ATTEMPT'] }
        }
      },
      {
        $group: {
          _id: "$installationId",
          totalProcessed: {
            $sum: { $cond: [{ $eq: ["$eventType", "AI_PROCESSED"] }, 1, 0] }
          },
          totalPrinted: {
            $sum: { $cond: [{ $eq: ["$eventType", "PRINTED"] }, 1, 0] }
          },
          screenshotAttempts: {
            $sum: { $cond: [{ $eq: ["$eventType", "SCREENSHOT_ATTEMPT"] }, 1, 0] }
          },
          accountId: { $first: "$accountId" },
          centerId: { $first: "$centerId" }
        }
      },
      {
        $project: {
          installationId: "$_id",
          accountId: 1,
          centerId: 1,
          totalProcessed: 1,
          totalPrinted: 1,
          screenshotAttempts: 1,
          abandonedCount: { $subtract: ["$totalProcessed", "$totalPrinted"] }
        }
      },
      {
        $sort: { screenshotAttempts: -1, abandonedCount: -1 }
      }
    ]);

    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('Error fetching abandonment metrics:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch metrics', error: error.message });
  }
};
