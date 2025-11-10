const BrandProfile = require('../model/BrandProfile');
const InfluencerProfile = require('../model/InfluencerProfile');
const User = require('../model/User');

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
    const influencerFields = ['category', 'bio', 'avatar_url', 'social_links'];
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
      const allowedFields = ['category', 'followers_count', 'engagement_rate', 'bio', 'social_links', 'avatar_url', 'phone'];
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

// Keep your existing methods for compatibility
exports.getBrandProfile = async (req, res) => {
  try {
    const profile = await BrandProfile.findOne({ brand_id: req.user._id });
    return res.json({ profile });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
};

exports.upsertBrandProfile = async (req, res) => {
  try {
    const allowed = ['company_name', 'industry', 'website', 'bio', 'avatar_url', 'phone'];
    const body = pick(req.body, allowed);

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
    const allowed = ['category', 'followers_count', 'engagement_rate', 'bio', 'social_links', 'avatar_url', 'phone'];
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