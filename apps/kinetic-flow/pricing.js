// ── Kinetic Flow pricing engine ─────────────────────────────────────────────
// Pure functions only: no DOM, no DB, no globals other than window.KFPricing.
// Everything the bid / change-order screens show comes out of here, so the
// same numbers can be asserted in tests/pricing.html and re-used by a real
// backend later. Decoded from the Master Scope Library (LIB-06) sheets and a
// filled-in bid workbook; every guess is recorded in
// docs/decisions/003-pricing-formulas.md.
//
// Money: values are plain JS numbers kept to cents (cents()) at every stored
// step, and rounded for display only by fmt(). The one deliberate extra
// rounding is the client price per division (ceilStep), which the sheet does.
(function (root) {
'use strict';

// Overridable via system_state rows (see settingsFromRows) — defaults are the
// values printed on the sheets.
const DEFAULTS = {
    taxMultiplier: 1.0745,     // "Tax Rate" cell on every division tab — applied to material lines
    frictionPct: 0.10,         // each friction toggle adds +10% to that task's labor cost
    contingencyPct: 0.10,      // "Contingency: 10% of total labor"
    includeContingency: false, // the sheet shows contingency beside, not inside, the division total
    roundStep: 5,              // client price per division is rounded UP to the next $5
    hoursPerDay: 8,
    mileageRatePerMile: 2.80,  // "Meet on site / Planning": miles away x 2 x $2.80 ($44.80 for 8 miles away)
    executionFuelAllowance: 12, // "Executing The Plan" line: typed-in 6 x 2 = $12.00 on every division tab
    planningRatePerHour: 90,   // "Meet on site / Planning" hours x $90, counted as labor
    sprintMaxDays: 4,          // 4-Day Sprint: Monday-Thursday
    smallJobThreshold: 5000,   // under this (or millwork) = 100% upfront
    defaultMarkup: 0.24,       // materials library markup
};

// The five hour columns on every division tab, in two groups (see docs/decisions/009):
//  - task performance (W/Y): quantity x hours x rate x friction, rates 300 / 500
//  - setup, staging and cleanup (AE/AG/AI): hours x rate x mobilization trips (NOT x quantity),
//    rates 85 / 120 / 200. 200 is "driving, setup, staging, tear down performed by Lead/Master".
const PERF_TIERS = ['lead', 'master'];
const STAGING_TIERS = ['apprentice', 'specialist', 'staging_lead'];
const TIERS = PERF_TIERS.concat(STAGING_TIERS);
const DEFAULT_RATES = { lead: 300, master: 500, apprentice: 85, specialist: 120, staging_lead: 200 };

const FRICTION_KEYS = ['no_power_water', 'ladder_scaffold', 'occupied'];
const FRICTION_LABELS = {
    no_power_water: 'No power / water within 25 ft',
    ladder_scaffold: 'Ladder / scaffold over 6 ft',
    occupied: 'Occupied home',
};

function num(x) { const n = Number(x); return isFinite(n) ? n : 0; }
// Exact-to-cents (not display rounding): keeps stored values from accumulating
// float noise like 399.71400000000006.
function cents(x) { return Math.round((num(x) + Number.EPSILON) * 100) / 100; }
function ceilStep(x, step) {
    step = step || 5;
    // epsilon guards 640.0000000001 style noise from tipping to the next step
    return Math.ceil(cents(x) / step - 1e-9) * step + 0; // + 0 turns -0 into 0
}
function fmt(x) {
    return '$' + num(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt0(x) { return '$' + num(x).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

function settingsFromRows(rows) {
    const s = Object.assign({}, DEFAULTS);
    const map = {
        tax_multiplier: 'taxMultiplier', friction_pct: 'frictionPct', contingency_pct: 'contingencyPct',
        include_contingency: 'includeContingency', round_step: 'roundStep', mileage_rate_per_mile: 'mileageRatePerMile',
        execution_fuel_allowance: 'executionFuelAllowance', sprint_max_days: 'sprintMaxDays',
        small_job_threshold: 'smallJobThreshold', planning_rate_per_hour: 'planningRatePerHour',
    };
    (rows || []).forEach(function (r) {
        const k = map[r.key];
        if (!k) return;
        s[k] = (typeof DEFAULTS[k] === 'boolean') ? String(r.value) === 'true' : num(r.value);
    });
    return s;
}

function ratesFromRows(rows) {
    const r = Object.assign({}, DEFAULT_RATES);
    (rows || []).forEach(function (x) { if (x.code) r[x.code === 'certified' ? 'staging_lead' : x.code] = num(x.hourly_rate); });
    return r;
}

function frictionCount(frictions) {
    if (!frictions) return 0;
    return FRICTION_KEYS.filter(function (k) { return !!frictions[k]; }).length;
}
// Additive, not compounding: three toggles = 1.30 (sheet: 12 SF x 0.1 h x $300 x 1.3 = $468).
function frictionMultiplier(frictions, settings) {
    const s = settings || DEFAULTS;
    return 1 + s.frictionPct * frictionCount(frictions);
}

// hoursPerUnit: { lead, master, apprentice, specialist, staging_lead }. lead/master are hours per
// unit of quantity; apprentice/specialist/staging_lead are setup/staging hours per mobilization trip.
// trips: the sheet's "Number of Mobilization Cycles / Return Trips" (column AD).
// A task "needs pricing" when it has no hours at all, and "needs trips" when its only hours are
// staging hours and trips is 0 (the sheet would silently price it at $0).
function hpuOf(hpu) {
    const h = hpu || {};
    return { lead: num(h.lead), master: num(h.master), apprentice: num(h.apprentice), specialist: num(h.specialist),
        staging_lead: num(h.staging_lead != null ? h.staging_lead : h.certified) };
}
function laborForTask(opts, settings, rates) {
    const s = settings || DEFAULTS, r = rates || DEFAULT_RATES;
    const qty = num(opts.quantity), trips = Math.max(0, num(opts.trips)), hpu = hpuOf(opts.hoursPerUnit);
    const mult = frictionMultiplier(opts.frictions, s);
    let perfHours = 0, perfBase = 0, stagingPerTrip = 0, stagingHoursPerTrip = 0;
    PERF_TIERS.forEach(function (t) { perfHours += qty * hpu[t]; perfBase += qty * hpu[t] * num(r[t]); });
    STAGING_TIERS.forEach(function (t) { stagingHoursPerTrip += hpu[t]; stagingPerTrip += hpu[t] * num(r[t]); });
    const stagingHours = stagingHoursPerTrip * trips, stagingCost = stagingPerTrip * trips;
    // The CI "Labor Tier Summary" (E6:E9) is quantity x hours for Apprentice / Specialist / Lead / Master,
    // even though staging is priced per trip. It ignores the 200 column. Kept as the sheet does it.
    const summaryHours = { apprentice: qty * hpu.apprentice, specialist: qty * hpu.specialist, lead: qty * hpu.lead, master: qty * hpu.master };
    const needsPricing = TIERS.every(function (t) { return !hpu[t]; });
    const needsTrips = !needsPricing && perfHours === 0 && stagingHoursPerTrip > 0 && trips === 0;
    return {
        needsPricing: needsPricing,
        needsTrips: needsTrips,
        trips: trips,
        summaryHours: summaryHours,
        performanceHours: perfHours,
        stagingHours: stagingHours,
        hoursRaw: perfHours + stagingHours,
        hoursAdjusted: perfHours * mult + stagingHours,   // friction slows task performance only
        frictionMultiplier: mult,
        performanceCost: cents(perfBase * mult),
        stagingCost: cents(stagingCost),
        baseCost: cents(perfBase + stagingCost),
        cost: cents(perfBase * mult + stagingCost),
    };
}

// Library material: (price x (1 + waste) + freight) x (1 + markup), e.g. a $100 dump fee at 24% = $124.
function materialUnitCost(mat, settings) {
    const s = settings || DEFAULTS;
    if (mat == null || mat.price == null || mat.price === '' || !isFinite(Number(mat.price))) return null; // needs pricing
    const markup = (mat.markup == null || mat.markup === '') ? s.defaultMarkup : num(mat.markup);
    return (num(mat.price) * (1 + num(mat.waste)) + num(mat.freight)) * (1 + markup);
}
function materialLine(opts, settings) {
    const unit = materialUnitCost(opts.material, settings);
    if (unit == null) return { needsPricing: true, unitCost: null, cost: 0, taxed: 0 };
    const cost = cents(unit * num(opts.quantity));
    // taxed is left unrounded: the sheet taxes the division's material subtotal once (372 x 1.0745 = 399.71, not 133.24 + 266.48)
    return { needsPricing: false, unitCost: cents(unit), cost: cost, taxed: cost * (settings || DEFAULTS).taxMultiplier };
}

// Mileage block on each division tab, charged only when that division's "# of Deployments" is set:
// planning round trip (miles x 2 x rate) + the "Executing The Plan" line go into Material Cost;
// planning hours x $90 go into Labor.
function mileage(milesAway, settings, planningHours) {
    const s = settings || DEFAULTS;
    const rt = num(milesAway) * 2;
    const planning = cents(rt * s.mileageRatePerMile);
    const execution = cents(s.executionFuelAllowance);
    const planningLabor = cents(num(planningHours) * s.planningRatePerHour);
    return { planning: planning, execution: execution, total: cents(planning + execution), roundTripMiles: rt, planningLabor: planningLabor };
}
const NO_MILEAGE = { planning: 0, execution: 0, total: 0, roundTripMiles: 0, planningLabor: 0 };

// A resolved line is one bid_line_items row with its library rows attached:
//   { id, kind: 'task'|'material', quantity, trips, frictions, included, status: {scope_code,is_billable},
//     task: {task_name, unit, hours_per_unit, default_trips}, kit: {id, pod_id, deployment_fee}|null,
//     material: {price, waste, freight, markup}|null, room }
function priceLine(line, settings, rates) {
    const s = settings || DEFAULTS;
    const status = line.status || { scope_code: 'BASE', is_billable: true };
    const out = {
        id: line.id, kind: line.kind, scopeCode: status.scope_code,
        included: line.included !== false, billable: !!status.is_billable && status.scope_code !== 'VOID',
        needsPricing: false, needsTrips: false, labor: 0, material: 0, materialTaxed: 0, summaryHours: null, hoursRaw: 0, hoursAdjusted: 0,
        kitId: null, kitFee: 0,
    };
    if (line.kind === 'material') {
        const m = materialLine({ material: line.material, quantity: line.quantity }, s);
        out.needsPricing = m.needsPricing; out.material = m.cost; out.materialTaxed = m.taxed; out.unitCost = m.unitCost;
    } else {
        const t = line.task || {};
        const trips = line.trips != null ? line.trips : t.default_trips;
        const l = laborForTask({ quantity: line.quantity, trips: trips, hoursPerUnit: t.hours_per_unit, frictions: line.frictions }, s, rates);
        out.needsPricing = l.needsPricing || l.needsTrips; out.needsTrips = l.needsTrips; out.trips = l.trips;
        out.labor = l.cost; out.performanceCost = l.performanceCost; out.stagingCost = l.stagingCost; out.summaryHours = l.summaryHours;
        out.hoursRaw = l.hoursRaw; out.hoursAdjusted = l.hoursAdjusted; out.frictionMultiplier = l.frictionMultiplier;
        if (line.kit) { out.kitId = line.kit.id; out.kitFee = cents(num(line.kit.deployment_fee)); }
    }
    return out;
}

// lines: resolved lines for ONE division. opts: { guys, milesAway, deployments, planningHours }
// (chargeMileage: true is accepted as an alias for deployments).
function divisionTotals(lines, opts, settings, rates) {
    const s = settings || DEFAULTS, o = opts || {};
    const priced = (lines || []).map(function (l) { return priceLine(l, s, rates); });
    const live = priced.filter(function (p) { return p.included && p.billable; });
    const excluded = priced.filter(function (p) { return !(p.included && p.billable); });
    let labor = 0, material = 0, materialTaxed = 0, hoursRaw = 0, hoursAdj = 0, needs = 0;
    const tier = { apprentice: 0, specialist: 0, lead: 0, master: 0 };
    const kitSeen = {}; let kitFees = 0;
    live.forEach(function (p) {
        labor += p.labor; material += p.material; materialTaxed += p.materialTaxed;
        hoursRaw += p.hoursRaw; hoursAdj += p.hoursAdjusted;
        if (p.needsPricing) needs++;
        if (p.summaryHours) Object.keys(tier).forEach(function (k) { tier[k] += p.summaryHours[k]; });
        if (p.kitId && !kitSeen[p.kitId]) { kitSeen[p.kitId] = true; kitFees += p.kitFee; } // one deployment per kit per division
    });
    const mi = (num(o.deployments) > 0 || o.chargeMileage) ? mileage(o.milesAway, s, o.planningHours) : NO_MILEAGE;
    labor = cents(labor + mi.planningLabor);  // the sheet's "Labor Estimated" includes the planning hours kitFees = cents(kitFees); materialTaxed = cents(materialTaxed); // tax applied once to the division's material subtotal
    const materialCostSheet = cents(materialTaxed + kitFees + mi.total); // the sheet's "Material Cost" cell
    const subtotal = cents(labor + materialCostSheet);
    const contingency = cents(labor * s.contingencyPct);
    const total = cents(subtotal + (s.includeContingency ? contingency : 0));
    const guys = Math.max(1, num(o.guys) || 1);
    return {
        labor: labor, materialsBeforeTax: cents(material), materialsTaxed: materialTaxed, kitFees: kitFees, mileage: mi,
        materialCost: materialCostSheet, subtotal: subtotal, contingency: contingency, total: total,
        clientTotal: live.length || mi.total || mi.planningLabor ? ceilStep(total, s.roundStep) : 0,
        hoursRaw: hoursRaw, hoursAdjusted: hoursAdj, tierHours: tier,
        days: hoursAdj > 0 ? Math.ceil(hoursAdj / (s.hoursPerDay * guys) - 1e-9) : 0,
        needsPricingCount: needs, lineCount: live.length, excludedCount: excluded.length,
        excludedLines: excluded,
    };
}

// divisions: [{ divisionNumber, name, lines, guys, deployments, planningHours }] in sequence order.
// Mileage is charged on every division whose deployments is set, as each division tab does.
function bidTotals(divisions, opts, settings, rates) {
    const s = settings || DEFAULTS, o = opts || {};
    const out = { divisions: [], labor: 0, materialCost: 0, subtotal: 0, contingency: 0, clientTotal: 0, days: 0, needsPricingCount: 0, hoursRaw: 0, tierHours: { apprentice: 0, specialist: 0, lead: 0, master: 0 }, kitFees: 0 };
    (divisions || []).forEach(function (d) {
        const t = divisionTotals(d.lines, { guys: d.guys, milesAway: o.milesAway, deployments: d.deployments, planningHours: d.planningHours }, s, rates);
        t.divisionNumber = d.divisionNumber; t.name = d.name; t.id = d.id;
        out.divisions.push(t);
        out.labor += t.labor; out.materialCost += t.materialCost; out.subtotal += t.subtotal; out.contingency += t.contingency;
        out.clientTotal += t.clientTotal; out.days += t.days; out.needsPricingCount += t.needsPricingCount; out.hoursRaw += t.hoursRaw; out.kitFees += t.kitFees;
        Object.keys(out.tierHours).forEach(function (k) { out.tierHours[k] += t.tierHours[k]; });
    });
    ['labor', 'materialCost', 'subtotal', 'contingency'].forEach(function (k) { out[k] = cents(out[k]); });
    out.exactTotal = out.subtotal;  // e.g. the DPS "Totals" row, before per-division rounding
    return out;
}

// 4-Day Sprint gate: crews work Monday-Thursday.
function sprintCheck(estimatedDays, settings) {
    const max = (settings || DEFAULTS).sprintMaxDays;
    return { days: estimatedDays, max: max, ok: estimatedDays <= max, message: estimatedDays <= max
        ? 'Fits the 4-Day Sprint (Mon-Thu).'
        : 'Estimated ' + estimatedDays + ' working days - more than the 4-Day Sprint (Mon-Thu). Split the job into sprints or get a Master sign-off.' };
}

// Payment terms gate: 100% upfront under $5,000 or for millwork; otherwise 50% deposit and the
// balance at the Thursday handover.
function paymentTerms(total, isMillwork, settings) {
    const s = settings || DEFAULTS, t = cents(total);
    if (t < s.smallJobThreshold || isMillwork) {
        return { mode: 'upfront', reason: isMillwork ? 'Millwork is paid 100% upfront.' : 'Jobs under ' + fmt0(s.smallJobThreshold) + ' are paid 100% upfront.',
            schedule: [{ label: 'Payment in full - due on acceptance', pct: 100, amount: t }] };
    }
    const dep = cents(t / 2);
    return { mode: 'split', reason: 'Jobs of ' + fmt0(s.smallJobThreshold) + ' or more: 50% deposit, balance at Thursday handover.',
        schedule: [{ label: 'Deposit - due on acceptance', pct: 50, amount: dep }, { label: 'Balance - due at Thursday handover', pct: 50, amount: cents(t - dep) }] };
}

// Change orders: only billable, non-VOID statuses count toward the billable total; PCO (pending change
// order) lines are a proposal - priced and shown, but not billable until the CO is signed and they flip to CO-nnn.
function changeOrderTotals(lines, settings, rates) {
    const t = divisionTotals(lines, { guys: 1 }, settings, rates);
    const pcoAsBillable = (lines || []).filter(function (l) { return l.status && l.status.scope_code === 'PCO' && l.included !== false; })
        .map(function (l) { return Object.assign({}, l, { status: { scope_code: 'PCO', is_billable: true } }); });
    const p = divisionTotals(pcoAsBillable, { guys: 1 }, settings, rates);
    return {
        total: t.clientTotal, exact: t.total, labor: cents(t.labor + p.labor), materialCost: cents(t.materialCost + p.materialCost),
        pendingAmount: p.total, proposedTotal: ceilStep(cents(t.total + p.total), (settings || DEFAULTS).roundStep),
        needsPricingCount: t.needsPricingCount + p.needsPricingCount, excludedCount: t.excludedCount - pcoAsBillable.length, days: t.days + p.days,
    };
}

const API = {
    DEFAULTS: DEFAULTS, DEFAULT_RATES: DEFAULT_RATES, TIERS: TIERS, PERF_TIERS: PERF_TIERS, STAGING_TIERS: STAGING_TIERS, FRICTION_KEYS: FRICTION_KEYS, FRICTION_LABELS: FRICTION_LABELS,
    cents: cents, ceilStep: ceilStep, fmt: fmt, fmt0: fmt0, settingsFromRows: settingsFromRows, ratesFromRows: ratesFromRows,
    frictionCount: frictionCount, frictionMultiplier: frictionMultiplier, laborForTask: laborForTask, materialUnitCost: materialUnitCost,
    materialLine: materialLine, mileage: mileage, priceLine: priceLine, divisionTotals: divisionTotals, bidTotals: bidTotals,
    sprintCheck: sprintCheck, paymentTerms: paymentTerms, changeOrderTotals: changeOrderTotals,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.KFPricing = API;
})(typeof window !== 'undefined' ? window : globalThis);
