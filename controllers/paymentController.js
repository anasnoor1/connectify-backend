const Stripe = require('stripe');
const User = require('../model/User');
const Transaction = require('../model/Transaction');
const Proposal = require('../model/Proposal');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? Stripe(stripeSecretKey) : null;

exports.getStripeStatus = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'influencer') {
      return res.status(403).json({ success: false, message: 'Only influencers can access payout settings' });
    }

    const user = await User.findById(req.user._id).select('stripeAccountId');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let connected = false;
    let detailsSubmitted = false;
    let payoutsEnabled = false;
    let chargesEnabled = false;

    if (stripe && user.stripeAccountId) {
      try {
        const account = await stripe.accounts.retrieve(user.stripeAccountId);
        detailsSubmitted = !!account?.details_submitted;
        payoutsEnabled = !!account?.payouts_enabled;
        chargesEnabled = !!account?.charges_enabled;
        // consider connected when onboarding completed and payouts are enabled (or charges enabled for completeness)
        connected = detailsSubmitted && (payoutsEnabled || chargesEnabled);
      } catch (e) {
        console.warn('Failed to retrieve Stripe account for status', user.stripeAccountId, e.message || e);
      }
    }

    return res.json({
      success: true,
      data: {
        stripeAccountId: user.stripeAccountId || null,
        connected,
        details_submitted: detailsSubmitted,
        payouts_enabled: payoutsEnabled,
        charges_enabled: chargesEnabled,
      },
    });
  } catch (err) {
    console.error('getStripeStatus error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch Stripe status' });
  }
};

exports.createPakPayment = async (req, res) => {
  try {
    const { proposalId, method } = req.body || {};

    if (!proposalId || !method) {
      return res.status(400).json({ success: false, message: 'proposalId and method are required' });
    }

    const normalized = String(method).toLowerCase();
    if (!['easypaisa', 'jazzcash'].includes(normalized)) {
      return res.status(400).json({ success: false, message: 'Unsupported method. Use easypaisa or jazzcash' });
    }

    const proposal = await Proposal.findById(proposalId).populate('campaignId');
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found' });
    }

    const brandId = proposal.campaignId?.brand_id?.toString();
    if (!req.user || !brandId || String(req.user._id) !== brandId) {
      return res.status(403).json({ success: false, message: "You don't have permission to pay for this proposal" });
    }

    if (proposal.campaignId.status === 'completed' || proposal.campaignId.status === 'cancelled' || proposal.campaignId.status === 'disputed') {
      return res.status(400).json({ success: false, message: 'Cannot pay for a completed, cancelled, or disputed campaign' });
    }

    // Simulate gateway redirect/processing delay (2-3 seconds)
    const delayMs = 1800 + Math.floor(Math.random() * 700);
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    const amountNumber = typeof proposal.amount === 'number' ? proposal.amount : Number(proposal.amount) || 0;
    if (!amountNumber || amountNumber <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid proposal amount' });
    }

    // Randomize outcome for demo (85% success)
    const succeeded = Math.random() < 0.85;

    const appFeePercent = 0.10;
    const appFee = Number((amountNumber * appFeePercent).toFixed(2));
    const influencerAmount = Number((amountNumber - appFee).toFixed(2));

    const prefix = normalized === 'easypaisa' ? 'EP' : 'JC';
    const fakeId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const tx = await Transaction.create({
      user_id: proposal.campaignId.brand_id,
      amount: amountNumber,
      transaction_type: 'debit',
      status: succeeded ? 'approved' : 'rejected',
      campaignId: proposal.campaignId._id,
      proposalId: proposal._id,
      method: normalized,
      transactionId: fakeId,
      currency: process.env.STRIPE_CURRENCY || 'usd',
      app_fee: appFee,
      influencer_amount: influencerAmount,
      isPayout: false,
      description: `Brand payment (${normalized}) for proposal ${proposal._id}`,
    });

    if (succeeded) {
      proposal.paymentStatus = 'paid';
      proposal.brandTransactionId = tx._id;
      await proposal.save();
    }

    return res.status(200).json({
      success: succeeded,
      data: {
        transactionId: tx.transactionId,
        status: succeeded ? 'succeeded' : 'failed',
        method: normalized,
        amount: amountNumber,
        createdAt: tx.created_at,
        proposal: succeeded ? proposal : undefined,
      },
      message: succeeded ? 'Payment succeeded (sandbox)' : 'Payment failed (sandbox)',
    });
  } catch (err) {
    console.error('createPakPayment error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process mock payment' });
  }
};

exports.createStripeConnectLink = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'influencer') {
      return res.status(403).json({ success: false, message: 'Only influencers can connect Stripe for payouts' });
    }

    if (!stripe) {
      return res.status(500).json({ success: false, message: 'Stripe is not configured on the server' });
    }

    const userId = req.user._id;
    let user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let accountId = user.stripeAccountId;
    let account = null;

    // Try to re-use existing connected account if we have one stored
    if (accountId) {
      try {
        account = await stripe.accounts.retrieve(accountId);
      } catch (e) {
        console.warn('Failed to retrieve existing Stripe account, will create a new one for user', String(userId), e.message || e);
        accountId = null;
        account = null;
      }
    }

    // If no valid account exists, create a new Express account and persist its id
    if (!accountId) {
      const country = process.env.STRIPE_DEFAULT_COUNTRY || 'US';
      account = await stripe.accounts.create({
        type: 'express',
        country,
        email: user.email,
        metadata: {
          userId: String(user._id),
          role: user.role,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      accountId = account.id;
      user.stripeAccountId = accountId;
      await user.save();
    }

    // Ensure we have the latest account object when re-using an existing account
    if (!account) {
      account = await stripe.accounts.retrieve(accountId);
    }

    // Determine frontend origin from env or request headers to build safe redirect URLs
    const headerOrigin = req.headers.origin;
    let headerRefererOrigin = null;
    try {
      if (req.headers.referer) headerRefererOrigin = new URL(req.headers.referer).origin;
    } catch (_) {}
    const frontendOrigin = process.env.CLIENT_APP_URL || headerOrigin || headerRefererOrigin || 'http://localhost:5173';

    const refreshUrl = process.env.STRIPE_CONNECT_REFRESH_URL || new URL('/influencer/dashboard?connect=refresh', frontendOrigin).toString();
    const returnUrl = process.env.STRIPE_CONNECT_RETURN_URL || new URL('/influencer/dashboard?connect=success', frontendOrigin).toString();

    // If the account is already onboarded, send a login link so they can manage payouts.
    // Otherwise, send an onboarding link so they can complete setup.
    if (account.details_submitted || account.charges_enabled || account.payouts_enabled) {
      const loginLink = await stripe.accounts.createLoginLink(accountId, {
        redirect_url: returnUrl,
      });

      return res.json({
        success: true,
        url: loginLink.url,
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return res.json({
      success: true,
      url: accountLink.url,
    });
  } catch (err) {
    console.error('createStripeConnectLink error:', err);

    let message = 'Failed to create Stripe connect link';
    if (err && err.raw && err.raw.type === 'invalid_request_error' && err.raw.message) {
      message = err.raw.message;
    }

    return res.status(500).json({ success: false, message });
  }
};

exports.disconnectStripe = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'influencer') {
      return res.status(403).json({ success: false, message: 'Only influencers can disconnect Stripe payouts' });
    }

    const user = await User.findById(req.user._id).select('stripeAccountId');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.stripeAccountId) {
      return res.status(400).json({ success: false, message: 'Stripe is not currently connected' });
    }

    user.stripeAccountId = null;
    await user.save();

    return res.json({
      success: true,
      message: 'Stripe has been disconnected for payouts',
    });
  } catch (err) {
    console.error('disconnectStripe error:', err);
    return res.status(500).json({ success: false, message: 'Failed to disconnect Stripe' });
  }
};
