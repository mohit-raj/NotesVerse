const crypto = require("crypto");
const db = require("./index.js");

function uid() {
  return crypto.randomUUID();
}

/* ---------------------------------------------------------------------
   Insert helpers
--------------------------------------------------------------------- */
const insSubject = db.prepare("INSERT INTO subjects (id,name,sort_order) VALUES (?,?,?)");
const insMT = db.prepare("INSERT INTO microthemes (id,subject_id,name,tag,sort_order) VALUES (?,?,?,?,?)");
const insQuote = db.prepare("INSERT INTO quotes (id,microtheme_id,text,sort_order) VALUES (?,?,?,?)");
const insSummary = db.prepare("INSERT INTO summary_lines (id,microtheme_id,text,sort_order) VALUES (?,?,?,?)");
const insPerson = db.prepare("INSERT INTO people (id,microtheme_id,name,tag,photo_url,sort_order) VALUES (?,?,?,?,?,?)");
const insPBullet = db.prepare("INSERT INTO people_bullets (id,person_id,text,sort_order) VALUES (?,?,?,?)");
const insSection = db.prepare("INSERT INTO sections (id,microtheme_id,title,starred,sort_order) VALUES (?,?,?,0,?)");
const insItem = db.prepare("INSERT INTO items (id,section_id,text,indent,sort_order) VALUES (?,?,?,?,?)");
const insPyq = db.prepare("INSERT INTO pyqs (id,microtheme_id,year,marks,question,aspect) VALUES (?,?,?,?,?,?)");
const insAspect = db.prepare("INSERT INTO aspects (id,microtheme_id,label,memorised) VALUES (?,?,?,?)");

function addMicrotheme(subjectId, order, name, tag, content) {
  const mtId = uid();
  insMT.run(mtId, subjectId, name, tag || "", order);

  (content?.quotes || []).forEach((q, i) => insQuote.run(uid(), mtId, q, i));
  (content?.summary || []).forEach((s, i) => insSummary.run(uid(), mtId, s, i));

  (content?.people || []).forEach((p, i) => {
    const pid = uid();
    insPerson.run(pid, mtId, p.name, p.tag || "", p.photo || "", i);
    (p.bullets || []).forEach((b, j) => insPBullet.run(uid(), pid, b, j));
  });

  const sections = content?.sections || [{ title: "Basics", items: [] }];
  sections.forEach((sec, i) => {
    const secId = uid();
    insSection.run(secId, mtId, sec.title, i);
    (sec.items || []).forEach((it, j) => insItem.run(uid(), secId, it.text, it.indent || 0, j));
  });

  (content?.pyqs || []).forEach((p) =>
    insPyq.run(uid(), mtId, p.year, p.marks, p.question, p.aspect || "")
  );
  (content?.aspects || []).forEach((a) =>
    insAspect.run(uid(), mtId, a.label, a.memorised ? 1 : 0)
  );

  return mtId;
}

/* ---------------------------------------------------------------------
   Full worked example: Public Distribution System & Food Security
--------------------------------------------------------------------- */
const PDS_CONTENT = {
  quotes: [
    "A nation's wealth is its food security; without it, all other development is fragile.",
    "India does not have a food production problem, it has a food access and distribution problem."
  ],
  summary: [
    "World's largest food-welfare system: the ==PDS== sends FCI-bought grain to ~80.1 crore people *(Indian Express, Jan 2026)*.",
    "The __NFSA, 2013__ makes this a ==legal right (right to food drawn from Art. 21)==.",
    "But ==~36% past leakage==, ==migrants left out==, and a rising food subsidy bill keep it under pressure."
  ],
  people: [
    {
      name: "Shanta Kumar", tag: "PDS/FCI reform",
      photo: "",
      bullets: [
        "His **2014-15 committee** proposed cutting NFSA coverage ==67% → 40%== + DBT cash transfer.",
        "Backed ==FCI reform, private storage== + an ==end to open-ended procurement=="
      ]
    },
    {
      name: "Amartya Sen", tag: "Right to food",
      photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Amartya%20Sen%202012.jpg?width=200",
      bullets: [
        "*Nobel laureate* economist; his __entitlement approach__ recast ==famine as failed access, not mere scarcity==.",
        "Held that '==a hungry person is not a free person==' – food as a basic freedom"
      ]
    }
  ],
  sections: [
    {
      title: "Basics — Key concepts + thinkers",
      items: [
        { text: "__PDS__ – supplies ==cheap food grain + essentials through Fair Price Shops== on a regular basis (MoCAFPD)." },
        { text: "__TPDS (1997)__ – targeted PDS; ==split households into BPL + APL + Antyodaya==; replaced universal PDS.", indent: 1 },
        { text: "__Right to food__ – ==PUCL vs Union of India (2001)== read it into Art. 21; later made law as NFSA 2013." },
        { text: "__Buffer stock__ – ==the least grain the Centre must keep in the Central Pool each quarter==, held by FCI (began in 4th FYP)." }
      ]
    },
    {
      title: "Key data",
      items: [
        { text: "__Beneficiaries__ – ==NFSA covers ~78.9 crore== (Oct 2025); ~80.1 crore PDS beneficiaries *(Indian Express, Jan 2026)*." },
        { text: "__Entitlement__ – ==5 kg== grain/person/month at PDS rates; Antyodaya households get ==35 kg/family== (NFSA)." },
        { text: "__Food subsidy__ – ==Rs 2.03 lakh crore== (FY26 BE); ==major subsidies fell from 1.9% of GDP (FY22) to 1.2% (FY25)== *(Economic Survey 2024-25)*." },
        { text: "__Leakage__ – Planning Commission estimated ==~36% diversion== of PDS rice + wheat all-India." },
        { text: "__Grain stocks__ – ==rice+wheat 99.7 mt (Feb 1, 2026)==, a record for that date vs 83.8 mt a year earlier *(Indian Express, Feb 2026)*." },
        { text: "__Hunger__ – India ranked ==102/123==, score 25.8 (\"serious\"), on Global Hunger Index 2025." }
      ]
    },
    {
      title: "Schemes + reforms",
      items: [
        { text: "__One Nation One Ration Card (ONORC)__ – ==a portable card that lets migrants draw rations anywhere== using an Aadhaar link." },
        { text: "__PMGKAY__ – ==free 5 kg grain now merged into NFSA==; ==NFSA extended 5 yrs to 2029== at an estimated cost *(Economic Survey 2024-25)*." },
        { text: "__Grain ATM (Annapurti)__ – ==solar-powered, 24x7 dispenser with Aadhaar fingerprint check==; gives 50 kg in 5 min, cuts waiting ==70%== *(WFP / Indian Express, Jan 2026)*." },
        { text: "__Digitisation__ – ==all ration cards now digital==; ==~90% Aadhaar-seeding + e-PoS== in place *(NITI Aayog)*." },
        { text: "__PDS Route Optimisation__ – IIT-Delhi/WFP model in 31 States/UTs; saves ~Rs 250 crore, cuts CO2 up to 35% *(Economic Survey 2024-25)*." }
      ]
    },
    {
      title: "Key committees + reports",
      items: [
        { text: "__Shanta Kumar Committee (2015)__ – proposed cutting ==NFSA coverage 67% → 40%==, cash transfer (DBT) in big cities, ending open-ended procurement, reshaping FCI." },
        { text: "__Ashok Dalwai Committee__ – ==FCI reforms, better technology, metal silos== to cut wastage." },
        { text: "__Justice Wadhwa Committee (2007)__ – ==end-to-end computerisation== of PDS, doorstep delivery + smart cards to curb leakage." }
      ]
    },
    {
      title: "Acts + provisions",
      items: [
        { text: "__NFSA, 2013__ – ==legal right to cheap grain for up to 75% rural + 50% urban== population; state govts decide who qualifies for the ration card." },
        { text: "__Essential Commodities Act, 1955__ – used to curb ==hoarding==; the 2020 amendment removed stock limits except in war/famine; PDS stocks exempt." }
      ]
    }
  ],
  pyqs: [
    { year: 2022, marks: 10, question: "What are the major challenges of Public Distribution System (PDS) in India? Is digitisation of PDS making it more transparent and accountable?", aspect: "PDS challenges + transparency fixes" },
    { year: 2021, marks: 15, question: "What are the salient features of the National Food Security Act, 2013? How has the Act enabled the states to eliminate hunger and malnutrition in India?", aspect: "NFSA 2013 features + impact on hunger" },
    { year: 2019, marks: 15, question: "What are the reformative steps taken by the government to make food grain distribution system more effective?", aspect: "Reformative steps for grain distribution" }
  ],
  aspects: [
    { label: "PDS challenges + transparency fixes", memorised: true },
    { label: "NFSA 2013 features + impact on hunger", memorised: true },
    { label: "Reformative steps for grain distribution", memorised: true }
  ]
};

/* ---------------------------------------------------------------------
   Full UPSC GS Mains structure (skeleton — fill in as you study)
   Each entry becomes an empty microtheme with a single "Basics" section,
   ready for you to add bullets, PYQs and aspects.
--------------------------------------------------------------------- */
const STRUCTURE = [
  {
    subject: "Agriculture",
    microthemes: [
      { name: "Cropping Patterns & Shifts", tag: "UPSC GS Mains · GS3 Agriculture" },
      { name: "Crop Diversification", tag: "UPSC GS Mains · GS3 Agriculture" },
      { name: "Horticulture, High-Value Crops & Millets", tag: "UPSC GS Mains · GS3 Agriculture" },
      { name: "Sustainable & Integrated Farming", tag: "UPSC GS Mains · GS3 Agriculture" },
      { name: "Irrigation & Micro-Irrigation", tag: "UPSC GS Mains · GS3 Agriculture" },
      { name: "Water Conservation & Groundwater", tag: "UPSC GS Mains · GS3 Agriculture" },
      { name: "Agricultural Marketing & Supply Chains", tag: "UPSC GS Mains · GS3 Agriculture" },
      { name: "MSP, Buffer Stock & Procurement", tag: "UPSC GS Mains · GS3 Agriculture" },
      { name: "Public Distribution System & Food Security", tag: "UPSC GS Mains · GS3 Agriculture", content: PDS_CONTENT },
      { name: "Agri Technology & Precision Farming", tag: "UPSC GS Mains · GS3 Agriculture" }
    ]
  },
  {
    subject: "Essay",
    microthemes: [
      { name: "Essay Paper — Approach, Structure & Strategy", tag: "UPSC Mains · Essay" }
    ]
  },
  {
    subject: "GS1 — History, Geography & Society",
    microthemes: [
      { name: "Modern Indian History — 1857 to Independence", tag: "UPSC GS Mains · GS1" },
      { name: "Art & Culture — Architecture, Dance, Music, Literature", tag: "UPSC GS Mains · GS1" },
      { name: "World History — Industrial & French Revolutions to Cold War", tag: "UPSC GS Mains · GS1" },
      { name: "Post-Independence Consolidation & Reorganisation", tag: "UPSC GS Mains · GS1" },
      { name: "Indian Society — Diversity, Poverty & Development", tag: "UPSC GS Mains · GS1" },
      { name: "Social Issues — Communalism, Regionalism, Secularism", tag: "UPSC GS Mains · GS1" },
      { name: "Role of Women & Women's Organisations", tag: "UPSC GS Mains · GS1" },
      { name: "Physical Geography — Climatology, Oceanography, Geomorphology", tag: "UPSC GS Mains · GS1" },
      { name: "Indian Geography — Resources, Industries, Infrastructure", tag: "UPSC GS Mains · GS1" },
      { name: "World Geography — Distribution of Key Natural Resources", tag: "UPSC GS Mains · GS1" }
    ]
  },
  {
    subject: "GS2 — Polity, Governance & IR",
    microthemes: [
      { name: "Indian Constitution — Historical Underpinnings & Basic Structure", tag: "UPSC GS Mains · GS2" },
      { name: "Union & State Executive, Legislature, Judiciary", tag: "UPSC GS Mains · GS2" },
      { name: "Federalism & Centre-State Relations", tag: "UPSC GS Mains · GS2" },
      { name: "Statutory, Regulatory & Quasi-Judicial Bodies", tag: "UPSC GS Mains · GS2" },
      { name: "Government Policies & Interventions for Development", tag: "UPSC GS Mains · GS2" },
      { name: "Welfare Schemes for Vulnerable Sections", tag: "UPSC GS Mains · GS2" },
      { name: "Health, Education & Human Resource", tag: "UPSC GS Mains · GS2" },
      { name: "E-governance, Transparency & Accountability", tag: "UPSC GS Mains · GS2" },
      { name: "India & its Neighbourhood", tag: "UPSC GS Mains · GS2" },
      { name: "Bilateral, Regional & Global Groupings", tag: "UPSC GS Mains · GS2" },
      { name: "International Institutions & Agencies", tag: "UPSC GS Mains · GS2" }
    ]
  },
  {
    subject: "GS3 — Economy, S&T, Environment & Security",
    microthemes: [
      { name: "Growth, Development & Inclusive Growth", tag: "UPSC GS Mains · GS3" },
      { name: "Budgeting & Mobilisation of Resources", tag: "UPSC GS Mains · GS3" },
      { name: "Land Reforms in India", tag: "UPSC GS Mains · GS3" },
      { name: "Effects of Liberalisation on the Economy", tag: "UPSC GS Mains · GS3" },
      { name: "Infrastructure — Energy, Ports, Roads, Airports, Railways", tag: "UPSC GS Mains · GS3" },
      { name: "Science & Technology — Developments & Applications", tag: "UPSC GS Mains · GS3" },
      { name: "Space & Defence Technology", tag: "UPSC GS Mains · GS3" },
      { name: "Environmental Pollution & Degradation", tag: "UPSC GS Mains · GS3" },
      { name: "Biodiversity & Conservation", tag: "UPSC GS Mains · GS3" },
      { name: "Disaster Management", tag: "UPSC GS Mains · GS3" },
      { name: "Internal Security — Extremism, Terrorism, Border Areas", tag: "UPSC GS Mains · GS3" },
      { name: "Cyber Security", tag: "UPSC GS Mains · GS3" }
    ]
  },
  {
    subject: "GS4 — Ethics, Integrity & Aptitude",
    microthemes: [
      { name: "Ethics & Human Interface", tag: "UPSC GS Mains · GS4" },
      { name: "Attitude & Emotional Intelligence", tag: "UPSC GS Mains · GS4" },
      { name: "Aptitude & Foundational Values for Civil Service", tag: "UPSC GS Mains · GS4" },
      { name: "Probity in Governance", tag: "UPSC GS Mains · GS4" },
      { name: "Case Studies — Applied Ethics", tag: "UPSC GS Mains · GS4" }
    ]
  },
  {
    subject: "Prelims — CSAT & Current Affairs",
    microthemes: [
      { name: "CSAT — Comprehension, Reasoning, Data Interpretation", tag: "UPSC Prelims · Paper II" },
      { name: "Current Affairs — National", tag: "UPSC Prelims" },
      { name: "Current Affairs — International", tag: "UPSC Prelims" }
    ]
  }
];

/* ---------------------------------------------------------------------
   Run
--------------------------------------------------------------------- */
function run() {
  const existing = db.prepare("SELECT COUNT(*) c FROM subjects").get().c;
  if (existing > 0) {
    console.log("Database already has data — skipping seed. Delete db/vault.sqlite3 to reseed from scratch.");
    return;
  }

  const insertAll = db.transaction(() => {
    STRUCTURE.forEach((subj, sIdx) => {
      const subjectId = uid();
      insSubject.run(subjectId, subj.subject, sIdx);
      subj.microthemes.forEach((mt, mIdx) => {
        addMicrotheme(subjectId, mIdx, mt.name, mt.tag, mt.content);
      });
    });
  });

  insertAll();
  console.log("Seeded database with full UPSC GS1–GS4 structure + a fully worked Agriculture/PDS example.");
}

run();
