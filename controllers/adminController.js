const User = require('../model/User');
const Campaign = require('../model/Campaign');
const Proposal = require('../model/Proposal');
const BrandProfile = require('../model/BrandProfile');
const ChatRoom = require('../model/Chat');
const Message = require('../model/Message');
const Transaction = require('../model/Transaction');
const Stripe = require('stripe');
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? Stripe(stripeSecretKey) : null;

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

      for (const p of completedProposals) {
        if (!p.influencerId) {
          continue;
        }
        if (!p.brandTransactionId || p.paymentStatus !== 'paid') {
          continue;
        }
        if (p.payoutTransactionId) {
          continue;
        }

        const brandTx = await Transaction.findById(p.brandTransactionId);
        if (!brandTx || brandTx.status !== 'approved') {
          continue;
        }

        const totalAmount = typeof brandTx.amount === 'number' ? brandTx.amount : Number(brandTx.amount) || 0;
        if (!totalAmount || totalAmount <= 0) {
          continue;
        }

        const appFee = Number((totalAmount * 0.10).toFixed(2));
        const influencerAmount = Number((totalAmount - appFee).toFixed(2));

        const influencerUserId = p.influencerId._id || p.influencerId;

        let stripeTransferId = null;

        if (stripe) {
          try {
            const influencerUser = await User.findById(influencerUserId).select('stripeAccountId');
            const destinationAccount = influencerUser && influencerUser.stripeAccountId;

            if (destinationAccount) {
              let canPayout = true;
              try {
                const destAccount = await stripe.accounts.retrieve(destinationAccount);
                if (!destAccount || destAccount.payouts_enabled !== true) {
                  canPayout = false;
                }
              } catch (e) {
                console.warn('Destination Stripe account lookup failed for user', String(influencerUserId), e?.raw?.message || e?.message || e);
                canPayout = false;
              }

              if (canPayout) {
                const params = {
                  amount: Math.round(influencerAmount * 100),
                  currency: brandTx.currency || 'usd',
                  destination: destinationAccount,
                  metadata: {
                    campaignId: String(id),
                    proposalId: String(p._id),
                    sourceTransactionId: String(brandTx._id),
                  },
                };
                if (brandTx.stripeChargeId) {
                  params.source_transaction = brandTx.stripeChargeId;
                }
                const transfer = await stripe.transfers.create(params);
                stripeTransferId = transfer.id;
              } else {
                console.warn('Destination Stripe account is not payout-enabled for user', String(influencerUserId));
              }
            } else {
              console.warn('Influencer has no stripeAccountId, skipping Stripe transfer for user', String(influencerUserId));
            }
          } catch (e) {
            console.error('Stripe transfer failed for proposal', String(p._id), e?.raw?.message || e);
          }
        }

        const payoutTx = await Transaction.create({
          user_id: influencerUserId,
          amount: influencerAmount,
          transaction_type: 'credit',
          status: stripeTransferId ? 'approved' : 'pending',
          campaignId: id,
          proposalId: p._id,
          app_fee: appFee,
          influencer_amount: influencerAmount,
          isPayout: true,
          sourceTransactionId: brandTx._id,
          currency: brandTx.currency,
          stripeTransferId,
          description: `Payout for campaign ${id} proposal ${p._id}`,
        });

        p.payoutTransactionId = payoutTx._id;
        await p.save();
      }
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

exports.getTransactions = async (req, res) => {
  try {
    const { status } = req.query;

    // Use Transaction as the primary source of truth for brand payments
    const brandTransactions = await Transaction.find({
      isPayout: false,
    })
      .populate({
        path: 'campaignId',
        select: 'title brand_id',
        populate: {
          path: 'brand_id',
          select: 'name email',
        },
      })
      .populate({
        path: 'proposalId',
        select: 'influencerId paymentStatus adminApprovedCompletion',
        populate: {
          path: 'influencerId',
          select: 'name email',
        },
      })
      .sort({ created_at: -1 });

    const brandTxIds = brandTransactions.map((tx) => tx._id);

    const payoutTransactions = await Transaction.find({
      isPayout: true,
      sourceTransactionId: { $in: brandTxIds },
    });

    const payoutBySourceId = new Map();
    for (const ptx of payoutTransactions) {
      if (ptx && ptx.sourceTransactionId) {
        payoutBySourceId.set(String(ptx.sourceTransactionId), ptx);
      }
    }

    let items = brandTransactions.map((tx) => {
      const campaign = tx.campaignId;
      const proposal = tx.proposalId;
      const brandUser = campaign && campaign.brand_id;
      const influencerUser = proposal && proposal.influencerId;
      const payoutTx = payoutBySourceId.get(String(tx._id)) || null;

      let derivedStatus = 'pending';

      if (tx.status === 'approved') {
        derivedStatus = 'ready_for_payout';
        if (payoutTx && payoutTx.status === 'approved' && payoutTx.stripeTransferId) {
          derivedStatus = 'paid';
        }
      }

      const amountNumber = typeof tx.amount === 'number' ? tx.amount : Number(tx.amount) || 0;

      return {
        proposalId: proposal && (proposal._id || proposal),
        brandId: brandUser && (brandUser._id || brandUser),
        brandName: brandUser && brandUser.name,
        influencerId: influencerUser && (influencerUser._id || influencerUser),
        influencerName: influencerUser && influencerUser.name,
        influencerEmail: influencerUser && influencerUser.email,
        campaignId: campaign && campaign._id,
        campaignTitle: campaign && campaign.title,
        amount: amountNumber,
        currency: tx.currency || 'usd',
        appFee: typeof tx.app_fee === 'number' ? tx.app_fee : 0,
        influencerAmount:
          typeof tx.influencer_amount === 'number' ? tx.influencer_amount : 0,
        stripePaymentIntentId: tx.stripePaymentIntentId,
        stripeTransferId: payoutTx && payoutTx.stripeTransferId,
        proposalPaymentStatus: proposal && proposal.paymentStatus,
        adminApprovedCompletion: !!(proposal && proposal.adminApprovedCompletion),
        status: derivedStatus,
      };
    });

    if (status) {
      items = items.filter((item) => item.status === status);
    }

    res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error('Admin getTransactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

exports.payoutProposal = async (req, res) => {
  try {
    const { proposalId } = req.params;

    const proposal = await Proposal.findById(proposalId)
      .populate('campaignId', 'title requirements')
      .populate('influencerId', 'name email');

    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found' });
    }

    if (!proposal.brandTransactionId || proposal.paymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Proposal does not have a paid brand transaction',
      });
    }

    const brandTx = await Transaction.findById(proposal.brandTransactionId);
    if (!brandTx || brandTx.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Brand transaction is not approved yet',
      });
    }

    let existingPayout = null;
    if (proposal.payoutTransactionId) {
      existingPayout = await Transaction.findById(proposal.payoutTransactionId);
    }

    if (existingPayout && existingPayout.status === 'approved' && existingPayout.stripeTransferId) {
      return res.status(400).json({ success: false, message: 'Payout already completed for this proposal' });
    }

    const totalAmount = typeof brandTx.amount === 'number' ? brandTx.amount : Number(brandTx.amount) || 0;
    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid brand transaction amount' });
    }

    const appFee = Number((totalAmount * 0.10).toFixed(2));
    const influencerAmount = Number((totalAmount - appFee).toFixed(2));

    const influencerUserId = proposal.influencerId._id || proposal.influencerId;

    let stripeTransferId = existingPayout ? existingPayout.stripeTransferId : null;

    if (stripe && !stripeTransferId) {
      try {
        const influencerUser = await User.findById(influencerUserId).select('stripeAccountId');
        const destinationAccount = influencerUser && influencerUser.stripeAccountId;

        if (!destinationAccount) {
          return res.status(400).json({ success: false, message: 'Influencer has no connected Stripe account' });
        }

        // Ensure the connected account can receive payouts
        try {
          const destAccount = await stripe.accounts.retrieve(destinationAccount);
          if (!destAccount || destAccount.payouts_enabled !== true) {
            return res.status(400).json({ success: false, message: 'Influencer Stripe account is not payout-enabled yet' });
          }
        } catch (e) {
          console.error('Stripe account retrieve failed for destination', destinationAccount, e?.raw?.message || e?.message || e);
          return res.status(400).json({ success: false, message: 'Influencer Stripe account is invalid or not accessible' });
        }

        const params = {
          amount: Math.round(influencerAmount * 100),
          currency: brandTx.currency || 'usd',
          destination: destinationAccount,
          metadata: {
            campaignId: String(proposal.campaignId),
            proposalId: String(proposal._id),
            sourceTransactionId: String(brandTx._id),
          },
        };
        // Use the original charge as source to avoid requiring platform available balance
        if (brandTx.stripeChargeId) {
          params.source_transaction = brandTx.stripeChargeId;
        }

        const transfer = await stripe.transfers.create(params);
        stripeTransferId = transfer.id;
      } catch (e) {
        const msg = e?.raw?.message || 'Stripe transfer failed for this proposal';
        console.error('Stripe transfer failed for manual payout of proposal', String(proposal._id), msg);
        return res.status(400).json({ success: false, message: msg });
      }
    }

    let payoutTx = existingPayout;
    if (!payoutTx) {
      payoutTx = await Transaction.create({
        user_id: influencerUserId,
        amount: influencerAmount,
        transaction_type: 'credit',
        status: stripeTransferId ? 'approved' : 'pending',
        campaignId: proposal.campaignId,
        proposalId: proposal._id,
        app_fee: appFee,
        influencer_amount: influencerAmount,
        isPayout: true,
        sourceTransactionId: brandTx._id,
        currency: brandTx.currency,
        stripeTransferId,
        description: `Manual payout for campaign ${proposal.campaignId} proposal ${proposal._id}`,
      });

      proposal.payoutTransactionId = payoutTx._id;
      await proposal.save();
    } else {
      payoutTx.amount = influencerAmount;
      payoutTx.app_fee = appFee;
      payoutTx.influencer_amount = influencerAmount;
      payoutTx.currency = brandTx.currency;
      payoutTx.stripeTransferId = stripeTransferId;
      payoutTx.status = stripeTransferId ? 'approved' : 'pending';
      await payoutTx.save();
    }

    return res.json({
      success: true,
      message: 'Payout processed for proposal',
      data: payoutTx,
    });
  } catch (error) {
    console.error('Admin payoutProposal error:', error);
    res.status(500).json({ success: false, message: 'Failed to process payout for proposal' });
  }
};
