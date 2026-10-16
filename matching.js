'use strict';
(() => {
  const HEURISTIC = 'Weighted evidence coverage over recognized signals only: mandatory=2, preferred=1, optional=0; partial evidence counts half. Not an ATS probability.';
  const evaluationCache = new WeakMap(), letterCache = new WeakMap(), evidenceCache = new WeakMap(), requirementCache = new WeakMap();
  const skills = [
    ['python_or_r', ['python', 'r programming', 'r language']],
    ['sql', ['sql', 'structured query language']], ['machine_learning', ['machine learning', 'ml model', 'predictive modelling', 'predictive modeling', 'artificial intelligence', 'ai-assisted']],
    ['data_analysis', ['scientific data analysis', 'data analysis', 'data analytics']], ['statistics', ['statistical analysis', 'statistics', 'anova', 'regression analysis']],
    ['chemometrics', ['chemometrics', 'multivariate analysis', 'pls', 'pca']], ['hplc', ['hplc', 'uplc', 'high performance liquid chromatography']],
    ['gc', ['gas chromatography', 'gc', 'gc-ms']], ['lc_ms', ['lc-ms', 'lc/ms', 'liquid chromatography mass spectrometry']],
    ['icp_oes', ['icp-oes', 'icp oes', 'inductively coupled plasma optical emission spectroscopy']],
    ['xrf', ['xrf', 'x-ray fluorescence', 'x ray fluorescence']], ['xrd', ['xrd', 'pxrd', 'xrpd', 'x-ray diffraction', 'x ray diffraction']],
    ['thermal_analysis', ['dsc', 'tga', 'thermal analysis']], ['spectroscopy', ['ir', 'ir spectroscopy', 'infrared spectroscopy', 'ftir', 'ft-ir', 'uv-vis', 'nmr', 'raman']],
    ['particle_size', ['particle size distribution', 'psd']], ['design_of_experiments', ['design of experiments', 'doe', 'response surface']],
    ['data_visualization', ['data visualization', 'data visualisation', 'dashboard', 'dashboards', 'data storytelling', 'business intelligence', 'bi tools', 'power bi', 'powerbi', 'tableau']],
    ['etl', ['etl', 'data pipeline', 'data pipelines']], ['lims', ['lims', 'laboratory informatics', 'digital lab']],
    ['software_development', ['scientific software', 'software development', 'internal tool', 'scientific application']],
    ['process_optimization', ['process optimization', 'process optimisation', 'process improvement', 'process robustness']],
    ['scale_up', ['scale-up', 'scale up', 'scaling up']], ['project_management', ['project management', 'project coordination', 'project planning', 'project delivery', 'project lifecycle']],
    ['stakeholder_management', ['stakeholder management', 'stakeholder engagement', 'cross-functional stakeholders']],
    ['team_supervision', ['team supervision', 'supervise junior', 'mentor junior', 'people development']],
    ['kpi', ['kpi', 'kpis', 'okr', 'okrs', 'performance dashboard']], ['sop', ['sop', 'standard operating procedure', 'technical documentation']],
    ['data_integrity', ['data integrity', 'traceability', 'audit trail']], ['excel', ['microsoft excel', 'excel']],
    ['gmp', ['gmp', 'good manufacturing practice']], ['gxp', ['gxp', 'good x practice']], ['method_validation', ['method validation', 'analytical validation']],
    ['capa', ['capa', 'deviation management', 'deviations']], ['regulatory', ['regulatory', 'ich', 'cmc', 'dossier']],
    ['msat', ['msat', 'manufacturing science and technology']], ['technology_transfer', ['technology transfer', 'tech transfer']],
    ['agile', ['agile', 'scrum']], ['lean_six_sigma', ['lean', 'six sigma', '6 sigma']],
    ['pharma', ['pharmaceutical', 'pharma', 'drug substance', 'drug product']], ['materials', ['materials science', 'materials chemistry', 'material characterization', 'material characterisation']],
    ['process_chemistry', ['process chemistry', 'chemical process', 'process development']], ['laboratory', ['laboratory analysis', 'lab analysis', 'analytical chemistry']],
    ['research_development', ['research and development', 'r&d', 'research development']]
  ];
  const related = {hplc: ['chromatography'], gc: ['chromatography'], lc_ms: ['chromatography'], machine_learning: ['neural network'], data_analysis: ['data processing', 'data management'], xrd: ['diffraction'], thermal_analysis: ['thermal characterization', 'thermal characterisation'], spectroscopy: ['spectroscopy'], materials: ['materials'], process_chemistry: ['process']};
  const protectedText = /\b(age|gender|sex|nationality|citizenship|marital status|disability|religion|race|ethnicity|sexual orientation)\b/i;
  const educationText = /^(?:education|academic background|courses?|training|certifications?|certificates?|bsc|bachelor(?:'s)?|msc|master(?:'s)?|phd|doctorate|degree|university|coursera)\b/i;
  const contactText = /\b(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d ()-]{7,}\d|https?:\/\/|www\.|address|contact|phone|email|orcid|linkedin)\b/i;
  const skillsList = /^(?:technical\s+)?(?:skills|core competencies|competencies)\s*[:|]/i;
  const normalizedTerms = new Map();
  const norm = value => ` ${String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9+#-]+/g, ' ')} `;
  const termNorm = term => { if (!normalizedTerms.has(term)) normalizedTerms.set(term, norm(term)); return normalizedTerms.get(term); };
  const hasNorm = (text, term) => text.includes(termNorm(term));
  const has = (text, term) => hasNorm(norm(text), term);
  const hasR = text => /\br(?=\s*(?:[,.)]|or\b|and\b|are\b|is\b|programming\b|language\b|$))/i.test(String(text));
  const supports = (text, term) => term === 'r' ? hasR(text) : has(text, term);
  const supportsPrepared = (paragraph, term) => term === 'r' ? paragraph._hasR : hasNorm(paragraph._normalized, term);

  function requirementBucket(description, term) {
    const source = String(description), lower = source.toLowerCase();
    let at = -1;
    for (const alias of term === 'r' ? ['r programming', 'r language', ' r,', ' or r', ' r '] : [term]) {
      at = lower.indexOf(alias.toLowerCase()); if (at >= 0) break;
    }
    const before = lower.slice(Math.max(0, at - 90), at);
    const after = lower.slice(at < 0 ? 0 : at, at < 0 ? 0 : at + 120);
    const cuePrefix = before.replace(/\be\s*\.?\s*g\.?/gi, 'eg').split(/[.!?;\n]/).pop();
    const cueScope = `${cuePrefix} ${after.split(/[.!?;\n]/)[0]}`;
    if (/\b(?:eg|for example|for instance|such as|including|like)\b/i.test(cueScope)) return 'optional';
    if (/\b(preferred|desirable|nice to have|a plus|ideally|an asset)\b/i.test(before + after)) return 'preferred';
    if (/\b(must|required|mandatory|essential|obbligatori[oa]|necessari[oa]|richiest[oa])\b/i.test(cueScope)) return 'mandatory';
    return 'mentioned';
  }

  function requirements(job) {
    if (job && typeof job === 'object' && requirementCache.has(job)) return requirementCache.get(job);
    const description = String(job && job.description || '');
    const text = norm(description);
    const found = [];
    for (const [id, terms] of skills) {
      if (id === 'python_or_r') {
        const python = hasNorm(text, 'python');
        const r = hasNorm(text, 'r programming') || hasNorm(text, 'r language') || supports(description, 'r');
        if (python && r) {
          const source = String(description);
          const either = /python[^.!?;\n]{0,45}\b(or|oppure|o)\b[^.!?;\n]{0,30}\br\b|\br\b[^.!?;\n]{0,30}\b(or|oppure|o)\b[^.!?;\n]{0,45}python/i.test(source);
          if (either) found.push({id, label: 'Python or R', terms: ['python', 'r programming', 'r language', 'r'], bucket: requirementBucket(source, 'python')});
          else {
            found.push({id: 'python', label: 'Python', terms: ['python'], bucket: requirementBucket(source, 'python')});
            found.push({id: 'r', label: 'R', terms: ['r programming', 'r language', 'r'], bucket: requirementBucket(source, 'r')});
          }
        } else if (python || r) found.push({id: python ? 'python' : 'r', label: python ? 'Python' : 'R', terms: python ? ['python'] : ['r programming', 'r language', 'r'], bucket: requirementBucket(String(description), python ? 'python' : 'r')});
        continue;
      }
      const present = terms.filter(term => hasNorm(text, term));
      if (!present.length) continue;
      found.push({id, label: present[0], terms: present, related: related[id] || [], bucket: requirementBucket(String(description), present[0])});
    }
    if (job && typeof job === 'object') requirementCache.set(job, found);
    return found;
  }

  function readableEvidence(cv) {
    if (cv && typeof cv === 'object' && evidenceCache.has(cv)) return evidenceCache.get(cv);
    const evidence = cv && (cv.cv_evidence || cv.evidence);
    if (!evidence || evidence.status !== 'available' || !Array.isArray(evidence.paragraphs)) return [];
    const prepared = evidence.paragraphs.filter(p => p && typeof p.text === 'string' && p.text.trim() && !protectedText.test(p.text) && !contactText.test(p.text))
      .map(p => ({...p, _normalized: norm(p.text), _hasR: hasR(p.text)}));
    if (cv && typeof cv === 'object') evidenceCache.set(cv, prepared);
    return prepared;
  }

  function evaluateUncached(job, cv) {
    const description = String(job && job.description || '');
    const paragraphs = readableEvidence(cv);
    const base = {heuristic: HEURISTIC, score: null, reason: '', matched: [], partial: [], missing: [], optional: []};
    if (!job || job.complete === false || description.trim().length < 200 || !String(job.title || '').trim() || !String(job.company || '').trim()) {
      base.reason = 'Posting is incomplete'; return base;
    }
    if (!paragraphs.length) { base.reason = 'CV evidence is unavailable'; return base; }
    const reqs = requirements(job);
    if (!reqs.length) { base.reason = 'No supported requirement could be identified'; return base; }
    const scored = reqs.filter(req => req.bucket !== 'optional');
    for (const req of reqs) {
      const directWork = [], directOther = [], relatedWork = [], relatedOther = [];
      for (const p of paragraphs) {
        const item = {paragraph: p.index, text: p.text, section: p.section || 'other'};
        const inRole = ['work', 'project'].includes(p.section);
        if (req.terms.some(term => supportsPrepared(p, term))) (inRole ? directWork : directOther).push(item);
        else if (req.related?.some(term => hasNorm(p._normalized, term))) (inRole ? relatedWork : relatedOther).push(item);
      }
      const direct = directWork.length > 0;
      const evidence = (direct ? directWork : [...directOther, ...relatedWork, ...relatedOther]).slice(0, 3);
      const status = direct ? 'matched' : evidence.length ? 'partial' : 'missing';
      const row = {requirement: req.label, status, bucket: req.bucket, weight: req.bucket === 'optional' ? 0 : req.bucket === 'mandatory' ? 2 : 1, evidence};
      if (req.bucket === 'optional') base.optional.push(row);
      else base[status].push(row);
    }
    if (!scored.length) { base.reason = 'Posting lists example skills only'; return base; }
    const totalWeight = scored.reduce((sum, req) => sum + (req.bucket === 'mandatory' ? 2 : 1), 0);
    const achieved = [...base.matched, ...base.partial].reduce((sum, row) => sum + row.weight * (row.status === 'matched' ? 1 : 0.5), 0);
    base.score = Math.round(achieved / totalWeight * 100);
    base.reason = 'Evidence coverage heuristic; review source paragraphs before deciding.';
    return base;
  }

  function cached(cache, job, cv, key, compute) {
    if (!job || typeof job !== 'object' || !cv || typeof cv !== 'object') return compute();
    let byCv = cache.get(job);
    if (!byCv) { byCv = new WeakMap(); cache.set(job, byCv); }
    let values = byCv.get(cv);
    if (!values) { values = new Map(); byCv.set(cv, values); }
    if (!values.has(key)) values.set(key, compute());
    return values.get(key);
  }

  function evaluate(job, cv) {
    return cached(evaluationCache, job, cv, 'result', () => evaluateUncached(job, cv));
  }

  function rank(job, documents) {
    return (Array.isArray(documents) ? documents : []).map(document => ({document, evaluation: evaluate(job, document)}))
      .sort((a, b) => (b.evaluation.score ?? -1) - (a.evaluation.score ?? -1));
  }

  function coverLetterUncached(job, cv, language = 'en') {
    const it = String(language).toLowerCase().startsWith('it');
    const base = {language: it ? 'it' : 'en', status: 'unavailable', text: '', evidence: []};
    const title = String(job && job.title || '').trim();
    const company = String(job && job.company || '').trim();
    if (!job || job.complete === false || String(job.description || '').trim().length < 200 || !title || !company) return base;
    const usable = readableEvidence(cv).filter(p => ['work', 'project'].includes(p.section) && !educationText.test(p.text) && !skillsList.test(p.text));
    const reqs = requirements(job).filter(req => req.bucket !== 'optional');
    const selected = [];
    for (const p of usable) {
      const relevant = reqs.some(r => r.terms.some(term => supportsPrepared(p, term)));
      if (relevant && p.text.length <= 500 && !selected.some(x => x.index === p.index)) selected.push(p);
      if (selected.length === 2) break;
    }
    if (!selected.length) return base;
    const bullets = selected.map(p => `• ${p.text.replace(/^[-•–]\s*/, '')}`).join('\n');
    const signature = readableEvidence(cv).some(p => /^matteo melegari$/i.test(p.text.trim())) ? '\nMatteo Melegari' : '';
    base.evidence = selected.map(p => ({paragraph: p.index, text: p.text, section: p.section}));
    base.text = it
      ? `Gentile team di selezione,\n\nDesidero candidarmi per la posizione di ${title} presso ${company}.\n\nTra le esperienze pertinenti al ruolo:\n${bullets}\n\nSono interessato a contribuire alle attività di ${company} e sarei lieto di approfondire il mio percorso in un colloquio.\n\nCordiali saluti`
      : `Dear Hiring Team,\n\nI am writing to apply for the ${title} role at ${company}.\n\nRelevant experience includes:\n${bullets}\n\nI would welcome the opportunity to discuss how this experience could contribute to ${company}.\n\nKind regards`;
    base.text += signature;
    base.status = 'draft';
    return base;
  }

  function coverLetter(job, cv, language = 'en') {
    const locale = String(language).toLowerCase().startsWith('it') ? 'it' : 'en';
    return cached(letterCache, job, cv, locale, () => coverLetterUncached(job, cv, locale));
  }

  globalThis.CareerMatching = {evaluate, rank, coverLetter};
})();
