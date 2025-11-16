const Campaign = require('../model/Campiagn');
const User = require('../model/User');
const BrandProfile = require('../model/BrandProfile');

exports.getBrandDashboard = async (req, res) => {
  try {
    const brandId = req.user._id;

    // Get campaign counts
    const campaignCounts = await Campaign.aggregate([
      { $match: { brand_id: brandId } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    // Convert to object
    const counts = {
      active: 0,
      pending: 0,
      completed: 0,
      cancelled: 0,
      total: 0
    };

    campaignCounts.forEach(item => {
      counts[item._id] = item.count;
      counts.total += item.count;
    });

    // Get recent campaigns
    const recentCampaigns = await Campaign.find({ brand_id: brandId })
      .sort({ created_at: -1 })
      .limit(5)
      .select('title status budget created_at');

    // Get performance data for graph (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyData = await Campaign.aggregate([
      {
        $match: {
          brand_id: brandId,
          created_at: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$created_at" },
            month: { $month: "$created_at" }
          },
          campaigns: { $sum: 1 },
          totalBudget: { $sum: "$budget" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    // Format monthly data for frontend
    const performanceData = monthlyData.map(item => ({
      month: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`,
      campaigns: item.campaigns,
      budget: item.totalBudget
    }));

    const brandProfile = await BrandProfile.findOne({ brand_id: brandId }).lean();

    const brandInfo = {
      name: brandProfile?.company_name || req.user.name,
      industry: brandProfile?.industry || null,
      email: req.user.email,
      phone: brandProfile?.phone || null,
      website: brandProfile?.website || null,
      avatar: brandProfile?.avatar_url || null,
      bio: brandProfile?.bio || null,
      createdAt: brandProfile?.created_at || req.user.createdAt || req.user.created_at || null
    };

    res.json({
      success: true,
      data: {
        counts,
        recentCampaigns,
        performanceData,
        brandInfo
      }
    });

  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard data' 
    });
  }
};