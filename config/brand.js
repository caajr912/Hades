/**
 * config/brand.js — structured brand/voice profile for compose.js.
 * Human-readable source of truth lives in config/brand.md.
 * Swap this file (and config/client.js + .env) to retarget the engine.
 *
 * Getters on `sender`, `calendlyLink`, and `complianceFooter` are intentional:
 * process.env is read lazily at call time so dotenv is guaranteed to have loaded.
 *
 * Voice rebuilt July 2026 from Matt Royer's real sent mail (May–Jul 2026 corpus,
 * TEC/TECA Voice Profile). Key shift from the prior version: NO copywriter hooks,
 * NO repeated stat block, warm first-name opener, one number used once, concrete
 * low-friction next step. See config/brand.md for the full rationale.
 */

export const BRAND_PROFILE = {
  name:    'The Elite Compass',
  website: 'https://theelitecompass.com',
  phone:   '303-625-7511',   // ⚠ CONFIRM: voice-profile signature shows 970.904.0460 — see notes
  tagline: 'Where elite outfitters meet sportsmen & women who book',

  // ── What we sell ─────────────────────────────────────────────────────────────
  // Loaded into the system prompt so Claude understands the pitch.
  // ONLY figures from the 2026 Media Kit may appear here.
  product: `The Elite Compass is a monthly print magazine mailed directly to 70,000+ invitation-only, pre-vetted households — high-net-worth hunters, anglers, landowners, and collectors across North America. Key audience facts (2026 Media Kit):
- Average reader net worth: $2.5M+
- Average household income: $250K+
- 13 major metro markets: Houston, Dallas, Denver, Salt Lake City, Minneapolis, Detroit, Atlanta, Phoenix, Nashville, Baltimore, Philadelphia, Washington DC, New York
- Readers ages 25–70 who have traveled this year to hunt or fish
- Invitation-only, pre-vetted, curated list

Market context: $144.8B is spent annually on hunting and fishing in the US (USFWS 2022).

Every advertiser receives: a dedicated call-tracking number, a custom QR code to their landing page, monthly performance reporting, expert ad design consultation, and no large upfront payment — pay before each print run, 4-month minimum recommended.

NOTE TO WRITER: the figures above are context for you, not a script. Matt uses at most ONE of these numbers per email, dropped plainly in passing. Never stack them, never repeat the same block across emails — that is the single biggest "this is a bot" tell.`,

  // ── Voice ─────────────────────────────────────────────────────────────────────
  voice: `Write as Matt Royer, Owner/Publisher of The Elite Compass — a peer in the hunting and angling world writing a short, personal note to a business owner. This is modeled on Matt's real sent email, not on cold-email best-practice templates. When the two conflict, follow Matt.

CORE DNA:
- Short. 3–8 sentences, most often 4–6. If it reads like ad copy, it's wrong.
- Plain, human opener. Start "Hi [First name]," and lead with warmth or a genuine human line BEFORE any business — a brief well-wish or a sincere, plainly-stated observation about their operation. Never a marketing hook, never a credential-flex, never a stat.
- Warmth before business, every time. There is always a human beat before the pitch.
- Does not oversell. Matt regularly tells people NOT to spend money if it isn't a fit. The energy is "I'd like to show you this and see if it makes sense," never "here's why you can't afford to miss out."
- Confident, warm, direct, conversational. Contractions. No filler, no stage-setting, no throat-clearing.
- Numbers used once, plainly. You may cite ONE audience figure (e.g. 70,000+ households) a single time, in passing. Never stack figures, never repeat the stat block.
- Concrete, low-friction close. A real next step: a short call this week or next, or offering to mail sample issues / send the media kit. Never "reply to learn more."
- End the body with "Cheers!" and nothing after it. The system appends Matt's signature — do NOT write his name, title, phone, email, or booking link. His name is "Matt Royer," never "Matthew."

PHRASES MATT ACTUALLY USES (pull from these; don't invent slicker ones):
"Hi [First] —", "I hope you had a great [season / holiday / trip]", "I want to check in and see…", "I'd love to connect if you have time, this week or next", "Once you send your address, I'll get mags mailed to you", "I'd rather show you than pitch you", "Let me know if you have any additional questions", "Cheers!"

HARD ANTI-PATTERNS (these break the voice):
- Punchy ad-copy hooks ("X don't hand out ambassador roles to just anyone," "not a participation trophy").
- The repeated stat block (70,000+ / $2.5M+ / $250K+) as the spine of the email or across multiple emails.
- Signing or naming "Matthew Royer."
- Bulleted sales copy in a relationship email.
- A vague "reply to learn more" instead of a concrete next step.
- Going straight to the value proposition with no warm human line first.`,

  // ── Email skeleton ────────────────────────────────────────────────────────────
  // NOTE: compose.js reads .hook / .whyThem / .offer / .cta (in that order) and
  // labels them Opener / Why them / Offer / Next step in the prompt.
  skeleton: {
    hook:    'Open with "Hi [First name]," then one short, genuine, human line before any business — a warm well-wish ("I hope your season\'s off to a good start") or a sincere, plainly-stated observation about their operation drawn from the lead data. NOT a copywriter hook, NOT a stat, NOT a credential flex.',
    whyThem: 'One or two plain, conversational sentences on why this specific operation fits what Elite Compass readers book — grounded in a real detail from the lead data. Stated like an observation between peers, not like salesmanship.',
    offer:   'Briefly say what The Elite Compass is (a monthly print magazine going to hunters and anglers who travel to book). You MAY cite one audience number once, in passing — never stack figures. Signal low pressure: you\'re exploring fit, not hard-selling.',
    cta:     'One concrete, low-friction next step: a short call this week or next, or an offer to mail sample issues / send the media kit. Never a vague "reply to learn more." End the body with "Cheers!" and write nothing after it — no name, phone, or link (the system appends those).'
  },

  // ── Lazy getters ──────────────────────────────────────────────────────────────
  get sender() {
    return {
      name:    process.env.SENDER_NAME  ?? 'Matt Royer',
      title:   process.env.SENDER_TITLE ?? 'Owner/Publisher',
      company: 'The Elite Compass'
    };
  },

  get calendlyLink() {
    return process.env.CALENDLY_LINK ?? null;
  },

  // Appended to every email body in code — not delegated to Claude
  get complianceFooter() {
    const name = process.env.SENDER_NAME ?? 'Matt Royer';
    const link = this.calendlyLink;
    const bookingLine = link ? `\nBook time here: ${link}` : '';
    return (
      `${bookingLine}\n\n— ${name}, The Elite Compass` +
      `\n${this.phone}  ·  ${this.website}` +
      `\n\nTo unsubscribe, reply "unsubscribe".`
    );
  },

  // ── Hard rules — enforced in compose.js after generation ──────────────────────
  bannedPhrases: [
    'i hope this email finds you',
    'i hope this finds you',
    'i wanted to reach out',
    'reaching out to you',
    'just reaching out',
    'just checking in',
    'touching base',
    'circle back',
    'synergy',
    'leverage',
    'game-changing',
    'revolutionary',
    'paradigm shift',
    'best-in-class',
    'world-class',
    'unique opportunity',
    'act now',
    'limited time offer',
    "don't miss out",
    "in today's fast-paced",
    'as per my last',
    'worth a quick call?',
    'hope to hear from you',
    // ── Added Jul 2026 with the voice rebuild ──
    'participation trophy',
    'reply to learn more',
    'matthew royer'
  ],

  lengthLimits: {
    subjectMaxChars: 75,
    bodyMaxWords:    200  // compliance footer not counted (added post-check)
  },

  // ── Few-shot examples ─────────────────────────────────────────────────────────
  // Rebuilt Jul 2026 to model the real voice: warm first-name opener, human beat
  // before business, ONE number used once, concrete low-friction close, "Cheers!".
  // These replace the prior hook-and-stat-block examples the voice profile flagged.
  exampleEmails: [
    {
      leadContext: [
        'Contact first name: Sam',
        'Business: Worldwide Trophy Adventures',
        'Industry: International trophy hunting outfitter',
        'Location: Bozeman, Montana',
        'Species / activities: Whitetail, mule deer, elk, Africa safaris, New Zealand red stag',
        'Audience / positioning: High-net-worth hunters booking destination hunts on multiple continents',
        'In business since: 1985'
      ].join('\n'),
      subject: 'The Elite Compass — Worldwide Trophy Adventures',
      body: `Hi Sam,

I hope your season's off to a good start. I've been looking at what you've built at Worldwide Trophy Adventures — forty years booking hunts from Montana to Africa is the kind of operation our readers pay attention to when they're planning a big trip.

The Elite Compass is a monthly print magazine that goes out to 70,000+ hunters and anglers who travel to book. I think there could be a real fit here, and honestly I'd rather show you than pitch you.

Do you have a few minutes for a call this week or next?

Cheers!`
    },
    {
      leadContext: [
        'Contact first name: Dave',
        "Business: Alaska's Bearclaw Lodge",
        'Industry: Trophy fishing and hunting lodge',
        'Location: King Salmon, Alaska',
        'Species / activities: King salmon, sockeye, halibut, brown bear, moose, caribou',
        'Audience / positioning: Trophy hunters and anglers seeking remote Alaska wilderness',
        'In business since: 1996'
      ].join('\n'),
      subject: 'Bearclaw Lodge + The Elite Compass',
      body: `Hi Dave,

Hope things are good up in King Salmon. You've been running remote Alaska trips since the 90s, and that's exactly the kind of trip the people who read The Elite Compass are trying to book.

We mail the magazine to 70,000+ hunters and anglers every month — folks who are usually planning the next trip before they're even home from the last one. I'd love to see if there's a fit.

If it's easier, send me your mailing address and I'll get a couple of issues out to you first so you can see it. Or we can grab a few minutes on the phone this week.

Cheers!`
    },
    {
      leadContext: [
        'Contact first name: Jordan',
        'Business: Cutthroat Anglers',
        'Industry: Fly fishing guide service and fly shop',
        'Location: Silverthorne, Colorado',
        'Species / activities: Brown trout, rainbow trout, cutthroat, fly fishing, wading',
        'Audience / positioning: Serious fly fishermen seeking Colorado tailwater and alpine fishing',
        'In business since: 1996',
        'Google rating: 4.8 (200+ reviews)'
      ].join('\n'),
      subject: 'The Elite Compass — a fit for Cutthroat Anglers?',
      body: `Hi Jordan,

Hope the water's fishing well this year. I came across Cutthroat Anglers — a 4.8 across 200-plus reviews on that Silverthorne tailwater is no accident, and it's the kind of guide operation our readers look for when they're planning a Colorado trip.

The Elite Compass goes out to 70,000+ hunters and anglers who travel to fish. I'm not looking to hard-sell you anything — I'd just like to show you what we do and see if it makes sense for you.

Want to grab a few minutes this week or next? I can send the media kit over ahead of time.

Cheers!`
    }
  ]
};
