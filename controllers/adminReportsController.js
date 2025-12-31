const Campaign = require('../model/Campaign');
const Proposal = require('../model/Proposal');
const Transaction = require('../model/Transaction');
const User = require('../model/User');
const BrandProfile = require('../model/BrandProfile');
const InfluencerProfile = require('../model/InfluencerProfile');

 const APP_FEE_PERCENT = 0.10;

 function requireExportDependency(name) {
   try {
     return require(name);
   } catch (e) {
     const err = new Error(
       `Missing export dependency: ${name}. Run "npm install" in backend folder and restart the server.`
     );
     err.code = 'EXPORT_DEP_MISSING';
     err.original = e;
     throw err;
   }
 }

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function getDateRange(req) {
  const fromRaw = req.query.from || req.query.startDate || req.query.start || null;
  const toRaw = req.query.to || req.query.endDate || req.query.end || null;

  let from = parseDate(fromRaw);
  let to = parseDate(toRaw);

  if (!to) to = new Date();
  if (!from) {
    from = new Date(to);
    from.setDate(from.getDate() - 30);
  }

  const fromStart = new Date(from);
  fromStart.setHours(0, 0, 0, 0);
  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);

  return { from: fromStart, to: toEnd };
}

function pickExportFormat(req) {
  const format = String(req.query.format || '').toLowerCase();
  if (['csv', 'pdf', 'excel', 'xlsx'].includes(format)) return format === 'xlsx' ? 'excel' : format;
  return 'excel';
}

function flattenValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(flattenValue).join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function rowsToCsv(rows) {
  const cols = new Set();
  rows.forEach((r) => {
    Object.keys(r || {}).forEach((k) => cols.add(k));
  });
  const headers = Array.from(cols);

  const esc = (s) => {
    const str = String(s ?? '');
    if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    return str;
  };

  const lines = [];
  lines.push(headers.map(esc).join(','));
  for (const r of rows) {
    lines.push(headers.map((h) => esc(flattenValue(r[h]))).join(','));
  }
  return lines.join('\n');
}

async function exportExcel(res, { title, sheets }) {
  const ExcelJS = requireExportDependency('exceljs');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Connectify';
  workbook.created = new Date();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name || 'Report');
    const rows = sheet.rows || [];

    if (rows.length === 0) {
      ws.addRow(['No data']);
      continue;
    }

    const cols = new Set();
    rows.forEach((r) => Object.keys(r || {}).forEach((k) => cols.add(k)));
    const headers = Array.from(cols);

    ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.min(Math.max(h.length + 4, 14), 45) }));

    for (const r of rows) {
      const row = {};
      headers.forEach((h) => {
        row[h] = flattenValue(r[h]);
      });
      ws.addRow(row);
    }

    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${title}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

async function exportPdf(res, { title, rows, subtitle }) {
  const PDFDocument = requireExportDependency('pdfkit');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${title}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(res);

  doc.fontSize(16).text(title, { align: 'left' });
  if (subtitle) {
    doc.moveDown(0.25);
    doc.fontSize(10).fillColor('#555').text(subtitle);
    doc.fillColor('#000');
  }
  doc.moveDown(1);

  const maxRows = 250;
  const slice = Array.isArray(rows) ? rows.slice(0, maxRows) : [];

  if (slice.length === 0) {
    doc.fontSize(12).text('No data');
    doc.end();
    return;
  }

  const cols = new Set();
  slice.forEach((r) => Object.keys(r || {}).forEach((k) => cols.add(k)));
  const headers = Array.from(cols);

  doc.fontSize(9).text(headers.join(' | '));
  doc.moveDown(0.5);

  slice.forEach((r) => {
    const line = headers.map((h) => flattenValue(r[h])).join(' | ');
    doc.text(line);
  });

  if ((rows || []).length > maxRows) {
    doc.moveDown(0.75);
    doc.fontSize(9).fillColor('#555').text(`Showing first ${maxRows} rows (export to CSV/Excel for full data).`);
    doc.fillColor('#000');
  }

  doc.end();
}

function exportCsv(res, { title, rows }) {
  const csv = rowsToCsv(rows || []);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${title}.csv"`);
  res.status(200).send(csv);
}

async function campaignPerformanceData(req) {
  const { from, to } = getDateRange(req);
  const status = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;

  const match = { created_at: { $gte: from, $lte: to } };
  if (status) match.status = status;

  const pipeline = [
    { $match: match },
    { $sort: { created_at: -1 } },
    {
      $lookup: {
        from: 'users',
        localField: 'brand_id',
        foreignField: '_id',
        as: 'brandUser',
      },
    },
    { $unwind: { path: '$brandUser', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'brandprofiles',
        localField: 'brand_id',
        foreignField: 'brand_id',
        as: 'brandProfile',
      },
    },
    { $unwind: { path: '$brandProfile', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'proposals',
        localField: '_id',
        foreignField: 'campaignId',
        as: 'proposals',
      },
    },
    {
      $lookup: {
        from: 'transactions',
        let: { cid: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$campaignId', '$$cid'] },
                  { $eq: ['$isPayout', false] },
                  { $eq: ['$status', 'approved'] },
                ],
              },
            },
          },
          {
            $group: {
              _id: '$campaignId',
              spend_total: { $sum: '$amount' },
              app_fee_total: { $sum: '$app_fee' },
              influencer_amount_total: { $sum: '$influencer_amount' },
              payments_count: { $sum: 1 },
            },
          },
        ],
        as: 'txAgg',
      },
    },
    { $unwind: { path: '$txAgg', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        proposals_total: { $size: '$proposals' },
        proposals_accepted: {
          $size: {
            $filter: {
              input: '$proposals',
              as: 'p',
              cond: { $eq: ['$$p.status', 'accepted'] },
            },
          },
        },
        proposals_completed_admin: {
          $size: {
            $filter: {
              input: '$proposals',
              as: 'p',
              cond: { $eq: ['$$p.adminApprovedCompletion', true] },
            },
          },
        },
        spend_total: { $ifNull: ['$txAgg.spend_total', 0] },
        app_fee_total: { $ifNull: ['$txAgg.app_fee_total', 0] },
        influencer_amount_total: { $ifNull: ['$txAgg.influencer_amount_total', 0] },
        payments_count: { $ifNull: ['$txAgg.payments_count', 0] },
      },
    },
    {
      $project: {
        _id: 1,
        title: 1,
        category: 1,
        status: 1,
        created_at: 1,
        updated_at: 1,
        budgetMin: 1,
        budgetMax: 1,
        max_influencers: '$requirements.max_influencers',
        brand_id: 1,
        brand_name: '$brandUser.name',
        brand_email: '$brandUser.email',
        brand_company_name: '$brandProfile.company_name',
        proposals_total: 1,
        proposals_accepted: 1,
        proposals_completed_admin: 1,
        spend_total: 1,
        app_fee_total: 1,
        influencer_amount_total: 1,
        payments_count: 1,
      },
    },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
  ];

  const result = await Campaign.aggregate(pipeline);
  const data = result?.[0]?.data || [];
  const total = result?.[0]?.total?.[0]?.count || 0;

  return {
    range: { from, to },
    data,
    meta: {
      total,
      totalPages: Math.ceil(total / limit) || 1,
      currentPage: page,
      limit,
    },
  };
}

async function brandSpendingData(req) {
  const { from, to } = getDateRange(req);

  const pipeline = [
    {
      $match: {
        isPayout: false,
        status: { $in: ['approved', 'pending'] },
        created_at: { $gte: from, $lte: to },
      },
    },
    {
      $addFields: {
        app_fee_effective: {
          $cond: [
            { $gt: ['$app_fee', 0] },
            '$app_fee',
            { $round: [{ $multiply: ['$amount', APP_FEE_PERCENT] }, 2] },
          ],
        },
        influencer_amount_effective: {
          $cond: [
            { $gt: ['$influencer_amount', 0] },
            '$influencer_amount',
            { $round: [{ $multiply: ['$amount', { $subtract: [1, APP_FEE_PERCENT] }] }, 2] },
          ],
        },
      },
    },
    {
      $group: {
        _id: '$user_id',
        spend_total: { $sum: '$amount' },
        app_fee_total: { $sum: '$app_fee_effective' },
        influencer_amount_total: { $sum: '$influencer_amount_effective' },
        payments_count: { $sum: 1 },
        unique_campaigns: { $addToSet: '$campaignId' },
      },
    },
    {
      $addFields: {
        campaigns_count: { $size: '$unique_campaigns' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'brandprofiles',
        localField: '_id',
        foreignField: 'brand_id',
        as: 'profile',
      },
    },
    { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        brand_id: '$_id',
        brand_name: '$user.name',
        brand_email: '$user.email',
        company_name: '$profile.company_name',
        industry: '$profile.industry',
        spend_total: 1,
        app_fee_total: 1,
        influencer_amount_total: 1,
        payments_count: 1,
        campaigns_count: 1,
      },
    },
    { $sort: { spend_total: -1 } },
  ];

  const data = await Transaction.aggregate(pipeline);

  return {
    range: { from, to },
    data,
  };
}

async function influencerEarningsData(req) {
  const { from, to } = getDateRange(req);

  const pipeline = [
    {
      $match: {
        isPayout: true,
        status: 'approved',
        created_at: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: '$user_id',
        earnings_total: { $sum: '$amount' },
        payouts_count: { $sum: 1 },
        unique_campaigns: { $addToSet: '$campaignId' },
      },
    },
    {
      $addFields: {
        campaigns_count: { $size: '$unique_campaigns' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'influencerprofiles',
        localField: '_id',
        foreignField: 'influencer_id',
        as: 'profile',
      },
    },
    { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        influencer_id: '$_id',
        influencer_name: '$user.name',
        influencer_email: '$user.email',
        instagram_username: '$profile.instagram_username',
        category: '$profile.category',
        followers_count: '$profile.followers_count',
        earnings_total: 1,
        payouts_count: 1,
        campaigns_count: 1,
      },
    },
    { $sort: { earnings_total: -1 } },
  ];

  const data = await Transaction.aggregate(pipeline);

  return {
    range: { from, to },
    data,
  };
}

async function platformRevenueData(req) {
  const { from, to } = getDateRange(req);

  const [volAgg] = await Transaction.aggregate([
    {
      $match: {
        isPayout: false,
        status: { $in: ['approved', 'pending'] },
        created_at: { $gte: from, $lte: to },
      },
    },
    {
      $addFields: {
        app_fee_effective: {
          $cond: [
            { $gt: ['$app_fee', 0] },
            '$app_fee',
            { $round: [{ $multiply: ['$amount', APP_FEE_PERCENT] }, 2] },
          ],
        },
        influencer_amount_effective: {
          $cond: [
            { $gt: ['$influencer_amount', 0] },
            '$influencer_amount',
            { $round: [{ $multiply: ['$amount', { $subtract: [1, APP_FEE_PERCENT] }] }, 2] },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        gross_volume: { $sum: '$amount' },
        platform_fee: { $sum: '$app_fee_effective' },
        influencer_amount_total: { $sum: '$influencer_amount_effective' },
        payments_count: { $sum: 1 },
      },
    },
  ]);

  const [payoutAgg] = await Transaction.aggregate([
    {
      $match: {
        isPayout: true,
        status: 'approved',
        created_at: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: null,
        payouts_paid: { $sum: '$amount' },
        payouts_count: { $sum: 1 },
      },
    },
  ]);

  const gross_volume = volAgg?.gross_volume || 0;
  const platform_fee = volAgg?.platform_fee || 0;
  const influencer_amount_total = volAgg?.influencer_amount_total || 0;
  const payments_count = volAgg?.payments_count || 0;

  const payouts_paid = payoutAgg?.payouts_paid || 0;
  const payouts_count = payoutAgg?.payouts_count || 0;

  return {
    range: { from, to },
    data: {
      gross_volume,
      platform_fee,
      influencer_amount_total,
      payments_count,
      payouts_paid,
      payouts_count,
      platform_profit: platform_fee,
    },
  };
}

async function summaryReportData(req) {
  const { from, to } = getDateRange(req);

  const [usersAgg, campaignsAgg] = await Promise.all([
    User.aggregate([
      { $match: { role: { $ne: 'admin' } } },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
        },
      },
    ]),
    Campaign.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const userCounts = usersAgg.reduce((acc, r) => {
    acc[r._id] = r.count;
    return acc;
  }, {});

  const campaignCounts = campaignsAgg.reduce((acc, r) => {
    acc[r._id] = r.count;
    return acc;
  }, {});

  const revenue = await platformRevenueData({ query: { from, to } });

  return {
    range: { from, to },
    data: {
      users: {
        total: (userCounts.brand || 0) + (userCounts.influencer || 0),
        brands: userCounts.brand || 0,
        influencers: userCounts.influencer || 0,
      },
      campaigns: {
        total: Object.values(campaignCounts).reduce((a, b) => a + b, 0),
        by_status: campaignCounts,
      },
      revenue: revenue.data,
    },
  };
}

exports.getCampaignPerformanceReport = async (req, res) => {
  try {
    const out = await campaignPerformanceData(req);
    return res.json({ success: true, ...out });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to build campaign performance report', error: err?.message });
  }
};

exports.getBrandSpendingReport = async (req, res) => {
  try {
    const out = await brandSpendingData(req);
    return res.json({ success: true, ...out });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to build brand spending report', error: err?.message });
  }
};

exports.getInfluencerEarningsReport = async (req, res) => {
  try {
    const out = await influencerEarningsData(req);
    return res.json({ success: true, ...out });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to build influencer earnings report', error: err?.message });
  }
};

exports.getPlatformRevenueReport = async (req, res) => {
  try {
    const out = await platformRevenueData(req);
    return res.json({ success: true, ...out });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to build platform revenue report', error: err?.message });
  }
};

exports.getSummaryReport = async (req, res) => {
  try {
    const out = await summaryReportData(req);
    return res.json({ success: true, ...out });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to build summary report', error: err?.message });
  }
};

exports.exportSummaryReport = async (req, res) => {
  try {
    const format = pickExportFormat(req);
    const out = await summaryReportData(req);

    const title = 'connectify_admin_summary';
    const subtitle = `Range: ${out.range.from.toISOString()} to ${out.range.to.toISOString()}`;

    const rows = [
      { metric: 'Users total', value: out.data.users.total },
      { metric: 'Brands', value: out.data.users.brands },
      { metric: 'Influencers', value: out.data.users.influencers },
      { metric: 'Campaigns total', value: out.data.campaigns.total },
      { metric: 'Gross volume', value: out.data.revenue.gross_volume },
      { metric: 'Platform fee', value: out.data.revenue.platform_fee },
      { metric: 'Influencer amount total', value: out.data.revenue.influencer_amount_total },
      { metric: 'Payouts paid', value: out.data.revenue.payouts_paid },
      { metric: 'Platform profit', value: out.data.revenue.platform_profit },
    ];

    const statusRows = Object.entries(out.data.campaigns.by_status || {}).map(([k, v]) => ({ status: k, count: v }));

    if (format === 'csv') {
      exportCsv(res, { title, rows: rows.concat([{ metric: '---', value: '---' }]).concat(statusRows) });
      return;
    }

    if (format === 'pdf') {
      await exportPdf(res, { title, subtitle, rows: rows.concat(statusRows) });
      return;
    }

    await exportExcel(res, {
      title,
      sheets: [
        { name: 'Summary', rows },
        { name: 'CampaignStatus', rows: statusRows },
      ],
    });
  } catch (err) {
    const status = err?.code === 'EXPORT_DEP_MISSING' ? 500 : 500;
    return res.status(status).json({ success: false, message: 'Failed to export summary report', error: err?.message });
  }
};

exports.exportReport = async (req, res) => {
  try {
    const type = String(req.params.type || '').toLowerCase();
    const format = pickExportFormat(req);

    let out;
    let title;
    let rows = [];

    if (type === 'campaign-performance') {
      out = await campaignPerformanceData(req);
      title = 'campaign_performance_report';
      rows = out.data;
    } else if (type === 'brand-spending') {
      out = await brandSpendingData(req);
      title = 'brand_spending_report';
      rows = out.data;
    } else if (type === 'influencer-earnings') {
      out = await influencerEarningsData(req);
      title = 'influencer_earnings_report';
      rows = out.data;
    } else if (type === 'platform-revenue') {
      out = await platformRevenueData(req);
      title = 'platform_revenue_report';
      rows = [out.data];
    } else {
      return res.status(400).json({ success: false, message: 'Unknown report type' });
    }

    const subtitle = `Range: ${out.range.from.toISOString()} to ${out.range.to.toISOString()}`;

    if (format === 'csv') {
      exportCsv(res, { title, rows });
      return;
    }

    if (format === 'pdf') {
      await exportPdf(res, { title, subtitle, rows });
      return;
    }

    await exportExcel(res, { title, sheets: [{ name: 'Report', rows }] });
  } catch (err) {
    const status = err?.code === 'EXPORT_DEP_MISSING' ? 500 : 500;
    return res.status(status).json({ success: false, message: 'Failed to export report', error: err?.message });
  }
};
