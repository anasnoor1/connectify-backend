const User = require('../model/User');
const Campaign = require('../model/Campaign');

const ALLOWED_USER_STATUSES = ['pending_verification', 'active', 'blocked'];
const ALLOWED_CAMPAIGN_STATUSES = ['pending', 'active', 'completed', 'cancelled'];

exports.getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const query = {};

    if (role && role !== 'all') {
      query.role = role;
    } else {
      query.role = { $ne: 'admin' };
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ created_at: -1 });

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error('Admin getAllUsers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ALLOWED_USER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'User status updated', data: user });
  } catch (error) {
    console.error('Admin updateUserStatus error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user status' });
  }
};

exports.getCampaigns = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 20, 100);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const campaigns = await Campaign.find(query)
      .sort({ created_at: -1 })
      .limit(parsedLimit)
      .skip((parsedPage - 1) * parsedLimit)
      .populate('brand_id', 'name email');

    const total = await Campaign.countDocuments(query);

    res.json({
      success: true,
      data: campaigns,
      meta: {
        total,
        totalPages: Math.ceil(total / parsedLimit),
        currentPage: parsedPage,
        limit: parsedLimit,
      },
    });
  } catch (error) {
    console.error('Admin getCampaigns error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch campaigns' });
  }
};

exports.updateCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ALLOWED_CAMPAIGN_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid campaign status' });
    }

    const updateData = {
      status,
      updated_at: new Date(),
    };

    // Enable reviews only when campaign is fully completed
    if (status === 'completed') {
      updateData.reviewEnabled = true;
    } else {
      updateData.reviewEnabled = false;
    }

    const campaign = await Campaign.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    res.json({ success: true, message: 'Campaign status updated', data: campaign });
  } catch (error) {
    console.error('Admin updateCampaignStatus error:', error);
    res.status(500).json({ success: false, message: 'Failed to update campaign status' });
  }
};
