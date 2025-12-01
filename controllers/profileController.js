const BrandProfile = require('../model/BrandProfile');
const InfluencerProfile = require('../model/InfluencerProfile');
const User = require('../model/User');
const Campaign = require('../model/Campaign');
const Proposal = require('../model/Proposal');

// Enhanced helper functions
function pick(obj, allowed) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of allowed) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

function formatValidationError(err) {
  if (!err || err.name !== 'ValidationError' || !err.errors) return null;
  const errors = {};
  for (const [path, detail] of Object.entries(err.errors)) {
    errors[path] = detail.message || 'Invalid value';
  }
  return errors;
}

// Profile completion calculator
function calculateProfileCompletion(profile, role) {
  let completedFields = 0;
  let totalFields = 0;

  if (role === 'brand') {
    const brandFields = ['company_name', 'industry', 'website', 'bio', 'avatar_url'];
    totalFields = brandFields.length;
    brandFields.forEach(field => {
      if (profile[field] && String(profile[field]).trim() !== '') completedFields++;
    });
  } else {
    const influencerFields = ['category', 'instagram_username', 'bio', 'avatar_url', 'social_links'];
    totalFields = influencerFields.length;
    influencerFields.forEach(field => {
      if (field === 'social_links') {
        if (profile[field] && profile[field].length > 0) completedFields++;
      } else if (profile[field] && String(profile[field]).trim() !== '') {
        completedFields++;
      }
    });
  }

  return Math.round((completedFields / totalFields) * 100);
}

// Get complete user profile with stats
exports.getCompleteProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    let profile = null;
    let stats = null;

    if (user.role === 'brand') {
      profile = await BrandProfile.findOne({ brand_id: req.user._id });
      if (profile) {
        stats = {
          profile_completion: calculateProfileCompletion(profile, 'brand'),
          campaigns_posted: 0,
          total_engagement: 0,
          member_since: user.created_at
        };
      }
    } else if (user.role === 'influencer') {
      profile = await InfluencerProfile.findOne({ influencer_id: req.user._id });
      if (profile) {
        stats = {
          profile_completion: calculateProfileCompletion(profile, 'influencer'),
          followers_count: profile.followers_count || 0,
          engagement_rate: profile.engagement_rate || 0,
          collaborations_completed: 0,
          member_since: user.created_at
        };
      }
    }

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_verified: user.is_verified,
        status: user.status
      },
      profile,
      stats,
      profile_completion: stats ? stats.profile_completion : 0
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
};

// Enhanced upsert for both roles
exports.upsertCompleteProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role === 'brand') {
      const allowedFields = ['company_name', 'industry', 'website', 'bio', 'avatar_url', 'phone'];
      const body = pick(req.body, allowedFields);

      // Handle company_name requirement
      if (!body.company_name && typeof req.body.name === 'string' && req.body.name.trim()) {
        body.company_name = req.body.name.trim();
      }

      const query = { brand_id: req.user._id };
      const existing = await BrandProfile.findOne(query);

      if (!existing && !body.company_name) {
        return res.status(400).json({
          message: 'Company name is required for brand profile creation',
          required: ['company_name']
        });
      }

      const updatedProfile = await BrandProfile.findOneAndUpdate(
        query,
        {
          $set: {
            ...body,
            brand_id: req.user._id
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true,
          context: 'query'
        }
      );

      const completion = calculateProfileCompletion(updatedProfile, 'brand');

      return res.json({
        message: 'Brand profile updated successfully',
        profile: updatedProfile,
        stats: { profile_completion: completion },
        role: 'brand'
      });

    } else if (user.role === 'influencer') {
      const allowedFields = ['category', 'instagram_username', 'followers_count', 'engagement_rate', 'bio', 'social_links', 'avatar_url', 'phone'];
      const body = pick(req.body, allowedFields);

      // Process numeric fields
      if (body.followers_count !== undefined) {
        body.followers_count = Number(body.followers_count);
        if (isNaN(body.followers_count)) delete body.followers_count;
      }
      if (body.engagement_rate !== undefined) {
        body.engagement_rate = Number(body.engagement_rate);
        if (isNaN(body.engagement_rate)) delete body.engagement_rate;
      }

      // Process social links
      if (body.social_links !== undefined) {
        if (typeof body.social_links === 'string') {
          body.social_links = body.social_links
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        }
        if (!Array.isArray(body.social_links)) delete body.social_links;
      }

      const updatedProfile = await InfluencerProfile.findOneAndUpdate(
        { influencer_id: req.user._id },
        {
          $set: {
            ...body,
            influencer_id: req.user._id
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true,
          context: 'query'
        }
      );

      const completion = calculateProfileCompletion(updatedProfile, 'influencer');

      return res.json({
        message: 'Influencer profile updated successfully',
        profile: updatedProfile,
        stats: {
          profile_completion: completion,
          followers_count: updatedProfile.followers_count || 0,
          engagement_rate: updatedProfile.engagement_rate || 0
        },
        role: 'influencer'
      });
    }

    return res.status(400).json({ message: 'Unsupported role for profile' });
  } catch (err) {
    const ve = formatValidationError(err);
    if (ve) return res.status(400).json({ message: 'Validation failed', errors: ve });
    return res.status(400).json({ message: 'Unable to save profile', error: err?.message });
  }
};

// Upload profile picture
exports.uploadAvatar = async (req, res) => {
  try {
    const { avatar_url } = req.body;

    if (!avatar_url) {
      return res.status(400).json({ message: 'Avatar URL is required' });
    }

    const user = await User.findById(req.user._id);
    let profile;

    if (user.role === 'brand') {
      profile = await BrandProfile.findOneAndUpdate(
        { brand_id: req.user._id },
        { $set: { avatar_url } },
        { new: true, upsert: true }
      );
    } else {
      profile = await InfluencerProfile.findOneAndUpdate(
        { influencer_id: req.user._id },
        { $set: { avatar_url } },
        { new: true, upsert: true }
      );
    }

    return res.json({
      message: 'Avatar updated successfully',
      avatar_url: profile.avatar_url
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update avatar', error: err?.message });
  }
};

// Search profiles
exports.searchProfiles = async (req, res) => {
  try {
    const { query, role, category, industry, minFollowers, maxFollowers } = req.query;
    let results = [];

    if (role === 'brand' || !role) {
      const brandQuery = {};
      if (query) {
        brandQuery.$or = [
          { company_name: { $regex: query, $options: 'i' } },
          { industry: { $regex: query, $options: 'i' } },
          { bio: { $regex: query, $options: 'i' } }
        ];
      }
      if (industry) brandQuery.industry = { $regex: industry, $options: 'i' };

      const brands = await BrandProfile.find(brandQuery)
        .populate('brand_id', 'name email')
        .limit(20);

      results = [...results, ...brands.map(brand => ({
        type: 'brand',
        profile: brand
      }))];
    }

    if (role === 'influencer' || !role) {
      const influencerQuery = {};
      if (query) {
        influencerQuery.$or = [
          { category: { $regex: query, $options: 'i' } },
          { bio: { $regex: query, $options: 'i' } }
        ];
      }
      if (category) influencerQuery.category = { $regex: category, $options: 'i' };
      if (minFollowers) influencerQuery.followers_count = { $gte: parseInt(minFollowers) };
      if (maxFollowers) {
        influencerQuery.followers_count = {
          ...influencerQuery.followers_count,
          $lte: parseInt(maxFollowers)
        };
      }

      const influencers = await InfluencerProfile.find(influencerQuery)
        .populate('influencer_id', 'name email')
        .limit(20);

      results = [...results, ...influencers.map(influencer => ({
        type: 'influencer',
        profile: influencer
      }))];
    }

    return res.json({ results, count: results.length });
  } catch (err) {
    return res.status(500).json({ message: 'Search failed', error: err?.message });
  }
};

// Public read-only influencer profile by slug (for /profile/i/:slug)
exports.getPublicInfluencerProfileBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ message: 'Invalid slug' });
    }

    // Match names like "Ali Khan" for slug "ali-khan" (case-insensitive)
    const nameRegex = new RegExp('^' + slug.replace(/-/g, '[\\s-]+') + '$', 'i');

    const user = await User.findOne({
      role: 'influencer',
      is_deleted: false,
      name: { $regex: nameRegex },
    }).select('_id name role is_verified status');

    if (!user) {
      return res.status(404).json({ message: 'Influencer not found' });
    }

    const profile = await InfluencerProfile.findOne({
      influencer_id: user._id,
    }).lean();

    // Return user data even if profile doesn't exist yet
    return res.json({
      data: {
        id: user._id,
        name: user.name,
        role: user.role,
        is_verified: user.is_verified,
        status: user.status,
        category: profile?.category || null,
        instagram_username: profile?.instagram_username || null,
        followers_count:
          typeof profile?.followers_count === 'number'
            ? profile.followers_count
            : null,
        engagement_rate:
          typeof profile?.engagement_rate === 'number'
            ? profile.engagement_rate
            : null,
        bio: profile?.bio || '',
        avatar_url: profile?.avatar_url || '',
        social_links: Array.isArray(profile?.social_links)
          ? profile.social_links
          : [],
        profile_incomplete: !profile,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load influencer profile', error: err?.message });
  }
};

// Public read-only brand profile by slug (for /profile/brand/:slug)
exports.getPublicBrandProfileBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ message: 'Invalid slug' });
    }

    const nameRegex = new RegExp('^' + slug.replace(/-/g, '[\\s-]+') + '$', 'i');

    // First try to match by company_name
    let brandProfile = await BrandProfile.findOne({
      company_name: { $regex: nameRegex },
    }).populate('brand_id', 'name role is_verified status');

    let user = brandProfile ? brandProfile.brand_id : null;

    // Fallback: try to resolve by user.name when company_name does not match
    if (!brandProfile) {
      user = await User.findOne({
        role: 'brand',
        is_deleted: false,
        name: { $regex: nameRegex },
      }).select('name role is_verified status');

      if (!user) {
        return res.status(404).json({ message: 'Brand not found' });
      }

      brandProfile = await BrandProfile.findOne({ brand_id: user._id });
    }

    if (!user) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    // Return user data even if profile doesn't exist yet
    return res.json({
      data: {
        id: user._id,
        name: user.name,
        role: user.role,
        is_verified: user.is_verified,
        status: user.status,
        company_name: brandProfile?.company_name || user.name,
        industry: brandProfile?.industry || null,
        website: brandProfile?.website || '',
        bio: brandProfile?.bio || '',
        avatar_url: brandProfile?.avatar_url || '',
        profile_incomplete: !brandProfile,
      },
    });

    const query = { brand_id: req.user._id };
    const existing = await BrandProfile.findOne(query);

    if (!existing && !body.company_name) {
      return res.status(400).json({ message: 'company_name is required for first-time brand profile creation' });
    }

    const update = { $set: { ...body, brand_id: req.user._id } };
    const updated = await BrandProfile.findOneAndUpdate(query, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: true,
      context: 'query',
    });
    return res.json({ profile: updated });
  } catch (err) {
    return res.status(400).json({ message: 'Unable to save brand profile', error: err?.message });
  }
};

// Get brand profile (used by /api/profile/brand GET)

exports.getBrandProfile = async (req, res) => {
  try {
    const profile = await BrandProfile.findOne({ brand_id: req.user._id });
    if (profile) {
      return res.json({ profile });
    }
    // Fallback: return user's name as company_name when profile not created yet
    const user = await User.findById(req.user._id).select('name');
    return res.json({ profile: { company_name: user?.name || '' } });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
};

exports.getInfluencerProfile = async (req, res) => {
  try {
    const profile = await InfluencerProfile.findOne({ influencer_id: req.user._id });
    return res.json({ profile });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
};

exports.upsertInfluencerProfile = async (req, res) => {
  try {
    const allowed = ['category', 'instagram_username', 'followers_count', 'engagement_rate', 'bio', 'social_links', 'avatar_url', 'phone'];
    const body = pick(req.body, allowed);

    if (body.followers_count !== undefined) {
      body.followers_count = Number(body.followers_count);
      if (isNaN(body.followers_count)) delete body.followers_count;
    }
    if (body.engagement_rate !== undefined) {
      body.engagement_rate = Number(body.engagement_rate);
      if (isNaN(body.engagement_rate)) delete body.engagement_rate;
    }
    if (body.social_links !== undefined) {
      if (typeof body.social_links === 'string') {
        body.social_links = body.social_links
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      }
      if (!Array.isArray(body.social_links)) delete body.social_links;
    }

    const query = { influencer_id: req.user._id };
    const update = { $set: { ...body, influencer_id: req.user._id } };
    const updated = await InfluencerProfile.findOneAndUpdate(query, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: true,
      context: 'query',
    });
    return res.json({ profile: updated });
  } catch (err) {
    return res.status(400).json({ message: 'Unable to save influencer profile', error: err?.message });
  }
};

exports.deleteBrandProfile = async (req, res) => {
  try {
    await BrandProfile.findOneAndDelete({ brand_id: req.user._id });
    return res.json({ message: 'Brand profile deleted' });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to delete brand profile', error: err?.message });
  }
};

exports.deleteInfluencerProfile = async (req, res) => {
  try {
    await InfluencerProfile.findOneAndDelete({ influencer_id: req.user._id });
    return res.json({ message: 'Influencer profile deleted' });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to delete influencer profile', error: err?.message });
  }
};

exports.deleteMyProfile = async (req, res) => {
  try {
    if (req.user.role === 'brand') {
      await BrandProfile.findOneAndDelete({ brand_id: req.user._id });
      return res.json({ message: 'Profile deleted', role: 'brand' });
    }
    if (req.user.role === 'influencer') {
      await InfluencerProfile.findOneAndDelete({ influencer_id: req.user._id });
      return res.json({ message: 'Profile deleted', role: 'influencer' });
    }
    return res.status(400).json({ message: 'Unsupported role for profile' });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to delete profile', error: err?.message });
  }
};

// Public read-only influencer profile by ID
exports.getPublicInfluencerProfileById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('_id name role is_verified status');

    if (!user || user.role !== 'influencer') {
      return res.status(404).json({ message: 'Influencer not found' });
    }

    const profile = await InfluencerProfile.findOne({ influencer_id: user._id }).lean();

    // Return user data even if profile doesn't exist yet
    return res.json({
      data: {
        id: user._id,
        name: user.name,
        role: user.role,
        is_verified: user.is_verified,
        status: user.status,
        category: profile?.category || null,
        instagram_username: profile?.instagram_username || null,
        followers_count:
          typeof profile?.followers_count === 'number'
            ? profile.followers_count
            : null,
        engagement_rate:
          typeof profile?.engagement_rate === 'number'
            ? profile.engagement_rate
            : null,
        bio: profile?.bio || '',
        avatar_url: profile?.avatar_url || '',
        social_links: Array.isArray(profile?.social_links)
          ? profile.social_links
          : [],
        profile_incomplete: !profile,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load influencer profile', error: err?.message });
  }
};

// Public read-only brand profile by ID
exports.getPublicBrandProfileById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('_id name role is_verified status');

    if (!user || user.role !== 'brand') {
      return res.status(404).json({ message: 'Brand not found' });
    }

    const profile = await BrandProfile.findOne({ brand_id: user._id }).lean();

    // Return user data even if profile doesn't exist yet
    // This allows viewing basic brand info before they complete their profile
    return res.json({
      data: {
        company_name: profile?.company_name || user.name,
        industry: profile?.industry || null,
        website: profile?.website || '',
        bio: profile?.bio || '',
        avatar_url: profile?.avatar_url || '',
        profile_incomplete: !profile, // Flag to indicate profile needs completion
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load brand profile', error: err?.message });
  }
};

// Public collaborations for an influencer (based on accepted proposals)
exports.getPublicInfluencerCollaborations = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('_id role is_deleted');

    if (!user || user.role !== 'influencer' || user.is_deleted) {
      return res.status(404).json({ message: 'Influencer not found' });
    }

    const proposals = await Proposal.find({
      influencerId: user._id,
      status: 'accepted',
    })
      .populate({
        path: 'campaignId',
        select: 'title category status brand_id created_at',
        populate: {
          path: 'brand_id',
          select: 'name',
        },
      })
      .sort({ createdAt: -1 })
      .limit(15);

    const brandIdsSet = new Set();

    proposals.forEach(p => {
      if (!p.campaignId || !p.campaignId.brand_id) return;
      const brandId = p.campaignId.brand_id._id || p.campaignId.brand_id;
      if (brandId) {
        brandIdsSet.add(brandId.toString());
      }
    });

    let brandProfilesMap = {};
    if (brandIdsSet.size > 0) {
      const brandIds = Array.from(brandIdsSet);
      const brandProfiles = await BrandProfile.find({
        brand_id: { $in: brandIds },
      }).select('brand_id company_name avatar_url');

      brandProfilesMap = {};
      brandProfiles.forEach(bp => {
        if (!bp.brand_id) return;
        brandProfilesMap[bp.brand_id.toString()] = {
          company_name: bp.company_name,
          avatar_url: bp.avatar_url || '',
        };
      });
    }

    const collaborations = [];

    proposals.forEach(p => {
      if (!p.campaignId || !p.campaignId.brand_id) return;

      const brandDoc = p.campaignId.brand_id;
      const brandId = (brandDoc._id || brandDoc).toString();
      const profile = brandProfilesMap[brandId] || {};

      collaborations.push({
        proposal_id: p._id,
        status: p.status,
        created_at: p.createdAt,
        campaign: {
          id: p.campaignId._id,
          title: p.campaignId.title,
          category: p.campaignId.category || null,
          status: p.campaignId.status,
        },
        brand: {
          id: brandId,
          name: brandDoc.name || profile.company_name || '',
          company_name: profile.company_name || null,
          avatar_url: profile.avatar_url || '',
        },
      });
    });

    return res.json({
      data: {
        collaborations,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load collaborations', error: err?.message });
  }
};

// Public collaborations for a brand (accepted proposals on its campaigns)
exports.getPublicBrandCollaborations = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('_id role is_deleted');

    if (!user || user.role !== 'brand' || user.is_deleted) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    const campaigns = await Campaign.find({
      brand_id: user._id,
    }).select('_id title category status created_at');

    if (!campaigns || campaigns.length === 0) {
      return res.json({ data: { collaborations: [] } });
    }

    const campaignIds = campaigns.map(c => c._id);
    const campaignMap = {};
    campaigns.forEach(c => {
      campaignMap[c._id.toString()] = c;
    });

    const proposals = await Proposal.find({
      campaignId: { $in: campaignIds },
      status: 'accepted',
    })
      .populate('influencerId', 'name')
      .sort({ createdAt: -1 })
      .limit(30);

    const influencerIdsSet = new Set();
    proposals.forEach(p => {
      if (!p.influencerId) return;
      influencerIdsSet.add(p.influencerId._id.toString());
    });

    let influencerProfilesMap = {};
    if (influencerIdsSet.size > 0) {
      const influencerIds = Array.from(influencerIdsSet);
      const influencerProfiles = await InfluencerProfile.find({
        influencer_id: { $in: influencerIds },
      }).select('influencer_id avatar_url instagram_username');

      influencerProfilesMap = {};
      influencerProfiles.forEach(ip => {
        if (!ip.influencer_id) return;
        influencerProfilesMap[ip.influencer_id.toString()] = {
          avatar_url: ip.avatar_url || '',
          instagram_username: ip.instagram_username || null,
        };
      });
    }

    const collaborations = [];

    proposals.forEach(p => {
      const campaign = campaignMap[p.campaignId.toString()];
      const influencer = p.influencerId;
      if (!campaign || !influencer) return;

      const profile = influencerProfilesMap[influencer._id.toString()] || {};

      collaborations.push({
        proposal_id: p._id,
        status: p.status,
        created_at: p.createdAt,
        campaign: {
          id: campaign._id,
          title: campaign.title,
          category: campaign.category || null,
          status: campaign.status,
        },
        influencer: {
          id: influencer._id,
          name: influencer.name,
          avatar_url: profile.avatar_url || '',
          instagram_username: profile.instagram_username || null,
        },
      });
    });

    return res.json({
      data: {
        collaborations,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load collaborations', error: err?.message });
  }
};