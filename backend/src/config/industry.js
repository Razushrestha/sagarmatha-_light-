const INDUSTRIES = ['hardware', 'paint', 'cafe', 'hotel'];

const MODULE_KEYS = [
  'partners',
  'warranty',
  'quotations',
  'projects',
  'tinting',
  'recipes',
  'tables',
  'shifts',
  'rooms',
  'housekeeping',
];

const DEFAULT_MODULES = {
  hardware: {
    partners: true,
    warranty: true,
    quotations: true,
    projects: true,
    tinting: false,
    recipes: false,
    tables: false,
    shifts: false,
    rooms: false,
    housekeeping: false,
  },
  paint: {
    partners: true,
    warranty: false,
    quotations: false,
    projects: false,
    tinting: true,
    recipes: false,
    tables: false,
    shifts: false,
    rooms: false,
    housekeeping: false,
  },
  cafe: {
    partners: false,
    warranty: false,
    quotations: false,
    projects: false,
    tinting: false,
    recipes: true,
    tables: true,
    shifts: true,
    rooms: false,
    housekeeping: false,
  },
  hotel: {
    partners: false,
    warranty: false,
    quotations: false,
    projects: false,
    tinting: false,
    recipes: true,
    tables: true,
    shifts: true,
    rooms: true,
    housekeeping: true,
  },
};

const PARTNER_LABELS = {
  hardware: { singular: 'Electrician', plural: 'Electricians' },
  paint: { singular: 'Painter', plural: 'Painters' },
  cafe: { singular: 'Partner', plural: 'Partners' },
  hotel: { singular: 'Partner', plural: 'Partners' },
};

function normalizeIndustry(value) {
  const industry = String(value || 'hardware').toLowerCase().trim();
  return INDUSTRIES.includes(industry) ? industry : 'hardware';
}

function modulesFor(industry, stored) {
  const modules = { ...DEFAULT_MODULES[normalizeIndustry(industry)] };
  if (stored && typeof stored === 'object') {
    for (const key of MODULE_KEYS) {
      if (typeof stored[key] === 'boolean') modules[key] = stored[key];
    }
  }
  if (normalizeIndustry(industry) === 'paint') modules.tinting = true;
  if (normalizeIndustry(industry) === 'cafe') {
    modules.recipes = true;
    modules.shifts = true;
    modules.tables = true;
    modules.partners = false;
    modules.warranty = false;
    modules.quotations = false;
    modules.projects = false;
    modules.tinting = false;
    modules.rooms = false;
    modules.housekeeping = false;
  }
  if (normalizeIndustry(industry) === 'hotel') {
    modules.recipes = true;
    modules.shifts = true;
    modules.tables = true;
    modules.rooms = true;
    modules.housekeeping = true;
    modules.partners = false;
    modules.warranty = false;
    modules.quotations = false;
    modules.projects = false;
    modules.tinting = false;
  }
  return modules;
}

function industryProfile(tenant) {
  if (!tenant) {
    return {
      industry: null,
      modules: MODULE_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {}),
      partnerLabel: PARTNER_LABELS.hardware,
    };
  }
  const industry = normalizeIndustry(tenant.industry);
  return {
    industry,
    modules: modulesFor(industry, tenant.modules),
    partnerLabel: PARTNER_LABELS[industry],
  };
}

function hasModule(tenant, name) {
  return Boolean(industryProfile(tenant).modules[name]);
}

module.exports = {
  INDUSTRIES,
  MODULE_KEYS,
  DEFAULT_MODULES,
  PARTNER_LABELS,
  normalizeIndustry,
  modulesFor,
  industryProfile,
  hasModule,
};
