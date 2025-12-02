const User = require('../model/User');
const Campaign = require('../model/Campaign');
const Proposal = require('../model/Proposal');
const BrandProfile = require('../model/BrandProfile');
const ChatRoom = require('../model/Chat');
const Message = require('../model/Message');

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

    const campaignData = campaigns.map(c => c.toObject());

    const brandIds = [];
    const campaignIds = [];
    campaignData.forEach(c => {
      if (c.brand_id && c.brand_id._id) {
        brandIds.push(c.brand_id._id.toString());
      }
      campaignIds.push(c._id);
    });

    let brandProfileMap = {};
    if (brandIds.length > 0) {
      const profiles = await BrandProfile.find({
        brand_id: { $in: [...new Set(brandIds)] },
      }).select('brand_id company_name industry avatar_url');

      brandProfileMap = profiles.reduce((acc, profile) => {
        if (profile.brand_id) {
          acc[profile.brand_id.toString()] = {
            company_name: profile.company_name || null,
            industry: profile.industry || null,
            avatar_url: profile.avatar_url || null,
          };
        }
        return acc;
      }, {});
    }

    let completedMap = {};
    if (campaignIds.length > 0) {
      const completedProposals = await Proposal.find({
        campaignId: { $in: campaignIds },
        influencerMarkedComplete: true,
      }).populate('influencerId', 'name email');

      completedMap = completedProposals.reduce((acc, proposal) => {
        const cid = proposal.campaignId?.toString();
        if (!cid) return acc;
        if (!acc[cid]) acc[cid] = [];
        acc[cid].push({
          name: proposal.influencerId?.name || 'Influencer',
          email: proposal.influencerId?.email || null,
          influencerId: proposal.influencerId?._id || null,
          proposalId: proposal._id,
        });
        return acc;
      }, {});
    }

    campaignData.forEach(c => {
      if (c.brand_id && c.brand_id._id) {
        const profile = brandProfileMap[c.brand_id._id.toString()];
        if (profile) {
          c.brandProfile = profile;
        }
      }
      c.completedInfluencers = completedMap[c._id.toString()] || [];
    });

    const total = await Campaign.countDocuments(query);

    res.json({
      success: true,
      data: campaignData,
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

    // Load campaign first so we can validate completion rules and use brand_id later
    const existingCampaign = await Campaign.findById(id);

    if (!existingCampaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    // When marking as completed, ensure the planned number of influencers
    // (max_influencers, default 1) have all marked completion.
    let influencerNamesForMessage = [];
    if (status === 'completed') {
      const maxInfluencers =
        (existingCampaign.requirements && existingCampaign.requirements.max_influencers) || 1;

      const completedProposals = await Proposal.find({
        campaignId: id,
        influencerMarkedComplete: true,
      }).populate('influencerId', 'name');

      if (completedProposals.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot mark campaign as completed without any influencers marking it completed',
        });
      }

      if (completedProposals.length < maxInfluencers) {
        return res.status(400).json({
          success: false,
          message: `All ${maxInfluencers} influencers must mark the campaign as completed before admin can complete it`,
        });
      }

      // Mark proposals as admin-approved completion and collect influencer names
      const now = new Date();
      await Proposal.updateMany(
        {
          campaignId: id,
          influencerMarkedComplete: true,
        },
        {
          $set: {
            adminApprovedCompletion: true,
            adminCompletionApprovedAt: now,
          },
        }
      );

      influencerNamesForMessage = completedProposals
        .filter(p => p.influencerId && p.influencerMarkedComplete)
        .map(p => p.influencerId.name)
        .filter(Boolean);
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

    // After marking as completed, push a summary message into related chats
    if (status === 'completed' && influencerNamesForMessage.length > 0) {
      try {
        const rooms = await ChatRoom.find({ campaignIds: id });
        if (rooms && rooms.length > 0) {
          const text = `Campaign completed by: ${influencerNamesForMessage.join(', ')}`;
          const now = new Date();
          const senderId = campaign.brand_id; // send as brand for visibility in chat

          for (const room of rooms) {
            await Message.create({
              roomId: room._id,
              senderId,
              message: text,
              isSystem: true,
            });

            room.lastMessage = {
              text,
              senderId,
              createdAt: now,
            };
            await room.save();
          }
        }
      } catch (err) {
        // Log but do not fail the API if chat notification fails
        console.error('Failed to send campaign completion message to chats:', err);
      }
    }

    res.json({ success: true, message: 'Campaign status updated', data: campaign });
  } catch (error) {
    console.error('Admin updateCampaignStatus error:', error);
    res.status(500).json({ success: false, message: 'Failed to update campaign status' });
  }
};
