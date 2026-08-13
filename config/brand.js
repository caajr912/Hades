/**
 * config/brand.js — structured brand/voice profile for compose.js.
 * Human-readable source of truth lives in config/brand.md.
 * Swap this file (and config/client.js + .env) to retarget the engine.
 *
 * Getters on `sender`, `calendlyLink`, and `complianceFooter` are intentional:
 * process.env is read lazily at call time so dotenv is guaranteed to have loaded.
 *
 * VOICE HISTORY
 * - Jul 2026 (v1 rebuild): killed copywriter hooks and the repeated stat block;
 *   warm first-name opener, one number used once, concrete low-friction close.
 * - Jul 2026 (v2): added deterministic per-lead style variants (see styleVariants
 *   + compose.js styleDirective) because stateless per-email calls converge on one
 *   pattern and cannot self-vary across a batch.
 * - Jul 2026 (v3, THIS VERSION): restructured from Matt's direct feedback on the
 *   6-draft preview. The email is now a MEETING REQUEST driven by curiosity about
 *   the prospect — NOT a magazine pitch. Matt: "I rarely like to lead with telling
 *   them who I am when I first reach out to get the meeting." The self-introduction
 *   is demoted to an optional half-sentence; the audience is raised as a question,
 *   not a stat drop; the ask is a meeting to learn about THEIR operation.
 */

export const BRAND_PROFILE = {
  name:    'The Elite Compass',
  website: 'https://theelitecompass.com',
  phone:   '303-625-7511',   // ⚠ CONFIRM: voice-profile signature shows 970.904.0460 — still unresolved
  tagline: 'Where elite outfitters meet sportsmen & women who book',

  // ── What we sell ─────────────────────────────────────────────────────────────
  // Context for the writer. ONLY figures from the 2026 Media Kit may appear here.
  product: `The Elite Compass is a monthly print magazine mailed directly to 70,000+ invitation-only, pre-vetted households — high-net-worth hunters, anglers, landowners, and collectors across North America. Key audience facts (2026 Media Kit):
- Average reader net worth: $2.5M+
- Average household income: $250K+
- 13 major metro markets: Houston, Dallas, Denver, Salt Lake City, Minneapolis, Detroit, Atlanta, Phoenix, Nashville, Baltimore, Philadelphia, Washington DC, New York
- Readers ages 25–70 who have traveled this year to hunt or fish
- Invitation-only, pre-vetted, curated list

Market context: $144.8B is spent annually on hunting and fishing in the US (USFWS 2022).

Every advertiser receives: a dedicated call-tracking number, a custom QR code to their landing page, monthly performance reporting, expert ad design consultation, and no large upfront payment — pay before each print run, 4-month minimum recommended.

CRITICAL NOTE TO WRITER: this is background so you understand the business. It is NOT the content of a first-touch email. A first email does not pitch the magazine. At most it mentions the reader network once, plainly, as context for why Matt is curious about their operation. Do not describe the magazine's features, pricing, or advertiser benefits in a cold email.`,

  // ── Voice ─────────────────────────────────────────────────────────────────────
  voice: `Write as Matt Royer, Owner/Publisher of The Elite Compass — a peer in the hunting and angling world writing a short, personal note to a business owner he'd genuinely like to talk to. This is modeled on Matt's real sent email, not on cold-email best-practice templates. When the two conflict, follow Matt.

WHAT THIS EMAIL IS: a request for a short meeting, driven by genuine curiosity about THEIR operation. It is NOT a pitch for the magazine. Matt's own words: "I rarely like to lead with telling them who I am when I first reach out to get the meeting. I generally open [warmly] but then I ask for a meeting to learn more about their operation."

CORE DNA:
- Short. 3–8 sentences, most often 4–6. If it reads like ad copy, it's wrong.
- Plain, human opener. Start "Hi [First name]," and lead with warmth or a genuine, specific observation about their operation. Never a marketing hook, never a credential-flex, never a stat.
- DO NOT open by introducing yourself or the magazine. Never begin the second beat with "I publish The Elite Compass, a monthly print magazine…" — that is the single thing Matt most wants removed. Who you are comes late, briefly, and optionally.
- Curiosity is the engine. The reason for the email is that Matt wants to hear THEIR story — how they got their access, why they run their operation the way they do, how they fill their season. Ask a real question you'd actually want answered.
- Does not oversell. Matt regularly tells people NOT to spend money if it isn't a fit. Energy is "I'd like to learn about you," never "here's why you can't afford to miss out."
- Confident, warm, direct, conversational. Contractions. No filler, no throat-clearing.
- The audience is raised as a QUESTION, not a stat drop — ask how they fill trips or whether they work with booking agencies, then mention the reader network once, plainly, as context.
- The ask is a MEETING. A short call to learn about their operation. Optionally add that you'd also love to share a bit about what you're working on.
- End the body with "Cheers!" and nothing after it. The system appends the signature — do NOT write his name, title, phone, email, or booking link. His name is "Matt Royer," never "Matthew."

CRAFT RULES (each learned from a real draft Matt corrected):
- Do not attach a sales tail to an observation. "...is exactly the kind of hunt our readers plan trips around" glued onto a compliment reads salesy. Matt's fix: follow the observation with genuine curiosity instead — "most of the outfitters I know run labs over pointers, I'd love to hear your story around why you're different."
- End the opener at its strongest point. Do not add a trailing qualifier clause. "Hard to beat Bristol Bay country for what you're doing out there" — Matt would have stopped at "Bristol Bay."
- Do not attempt folksy idiom you cannot land precisely. A draft read "Not a lot of guides are willing to put in that kind of country," which is not idiomatic English. If you mean effort or distance, say it concretely — Matt's fix: "many guys are unwilling to put in that kind of mileage."
- Never reuse the construction "that's the kind of [X] our readers are looking for / plan trips around." It is both salesy and repetitive.

HARD ANTI-PATTERNS:
- Leading with who you are or what the magazine is.
- Punchy ad-copy hooks ("X don't hand out ambassador roles to just anyone," "not a participation trophy").
- Stacking audience figures. Use AT MOST ONE audience number in any single email — never two (do not pair "$2.5M+ net worth" with "70,000+ households").
- Pitching magazine features, pricing, QR codes, call tracking, or advertiser benefits in a first email.
- Inventing reader behavior. You may state the approved general truth (readers are high-net-worth hunters and anglers who travel to book). You may NOT fabricate specific reader intent about THIS operation.
- Inventing facts about the prospect — especially tenure. Do NOT calculate or state a number of years in business or company age, even when a founding year is given. Refer to longevity only vaguely ("long-running," "well-established") or not at all. A wrong number is worse than none.
- Date/season assumptions. You don't know when this will be read. Avoid "this fall," "this season." Keep well-wishes evergreen.
- Signing or naming "Matthew Royer."
- Bulleted sales copy in a relationship email.

PHRASES MATT ACTUALLY USES (pull from these; don't invent slicker ones):
"Hi [First] —", "I hope you had a great [trip]", "I want to check in and see…", "I'd love to hear the story behind…", "I'm curious if you work with any booking agencies and how that works for you all", "I'd love to learn more about your business", "I'd also love to share a bit about what I'm working on", "I'd love to connect if you have time, this week or next", "I'd rather show you than pitch you", "Let me know if you have any additional questions", "Cheers!"`,

  // ── Email skeleton ────────────────────────────────────────────────────────────
  // compose.js reads .hook / .whyThem / .offer / .cta (in that order) and labels
  // them Opener / Curiosity / Audience door / The ask in the prompt.
  skeleton: {
    hook:    'Open with "Hi [First name]," then one short, genuine, human line — an evergreen well-wish, a plain specific observation about their operation, or simply why you\'re writing ("I came across [Company]…"). End it at its strongest point; no trailing qualifier, no sales tail, and do NOT introduce yourself or the magazine here.',
    whyThem: 'Follow with GENUINE CURIOSITY about their operation, grounded in a real detail from the lead data — a question you\'d actually want answered. "I\'d love to hear the story behind [their private access / their dogs / their water]." This is the heart of the email. Do not convert the observation into a sales point.',
    offer:   'Open the door on the audience as a QUESTION, not a pitch: ask how they fill their season or whether they work with booking agencies. Then mention the reader network once, plainly, as context — a network of 70,000+ hand-selected, high-net-worth sportsmen and sportswomen who book these kinds of trips. Do NOT describe the magazine, its features, or pricing. You may optionally add that you\'d love to share a bit about what you\'re working on.',
    cta:     'Ask for a short meeting, framed as wanting to learn more about their operation. End the body with "Cheers!" and write nothing after it — no name, phone, or link (the system appends those).'
  },

  // ── Per-email style variants ──────────────────────────────────────────────────
  // compose.js deterministically assigns one of each (hashed from the lead's email)
  // and injects them as a STYLE block. Each email is composed by an independent,
  // stateless model call that can't see the others, so "please vary" can't work —
  // the variety has to be assigned per lead. "{company}" is filled by compose.js.
  styleVariants: {
    openers: [
      'Open with a sincere, plain, specific observation about their operation — no well-wish, no stat, no hook. End it at its strongest point.',
      "Open with a brief, evergreen well-wish tied to their place or pursuit (nothing date- or season-specific), then move straight into curiosity about their operation.",
      'Open by getting right to why you\'re writing, warmly — lead with "I came across {company}…" or similar, followed by one specific observation.'
    ],
    audienceDoors: [
      'Ask whether they work with booking agencies and how that\'s worked for them, then mention plainly that you have a network of 70,000+ hand-selected high-net-worth sportsmen and sportswomen who book these kinds of trips.',
      'Ask how they typically fill their season — repeat clients, word of mouth, agencies — then note plainly that you work with a network of 70,000+ hand-selected sportsmen and sportswomen booking trips like theirs.',
      'Ask how most of their clients find them, then mention plainly that the people you work with are a hand-selected network of 70,000+ high-net-worth hunters and anglers who travel to book. Add that you\'d also love to share a bit about what you\'re working on.'
    ],
    closes: [
      'Ask for a short call to hear more about their operation — "I\'d love to connect if you have time, this week or next."',
      'Ask whether they\'d have a few minutes on the phone in the next week or two to walk you through how their operation works.',
      'Ask for a short conversation to learn more about their business, and offer to work around their schedule.'
    ],
    subjects: [
      'The Elite Compass — {company}',
      '{company} + The Elite Compass',
      'A few questions about {company}'
    ]
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
    'participation trophy',
    'reply to learn more',
    'matthew royer',
    // ── Added Jul 2026 (v3) from Matt's feedback ──
    'monthly print magazine mailed to',
    'i publish the elite compass'
  ],

  lengthLimits: {
    subjectMaxChars: 75,
    bodyMaxWords:    200  // compliance footer not counted (added post-check)
  },

  // ── Few-shot examples ─────────────────────────────────────────────────────────
  // Rewritten Jul 2026 (v3) to Matt's structure: warm opener → real curiosity →
  // audience raised as a question → meeting ask. No self-introduction lead, no
  // magazine pitch. Three different opener types, audience doors, closes, and
  // subject formats so the composer has varied bones to copy.
  exampleEmails: [
    {
      // Opener: plain observation.  Door: booking agencies.  Close: this week or next.
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

Booking hunts on three continents out of one Bozeman office is no small thing to keep running well. I'd love to hear how you built the outfitter relationships behind that — especially on the Africa and New Zealand side.

I'm also curious whether you work with any booking agencies, and how that's worked for you all. I've got a network of 70,000+ hand-selected sportsmen and sportswomen who book exactly these kinds of trips.

Any chance you'd have a few minutes to connect this week or next? I'd like to hear more about how the operation runs.

Cheers!`
    },
    {
      // Opener: evergreen well-wish.  Door: how they fill the season.  Close: few minutes on the phone.
      leadContext: [
        'Contact first name: Dave',
        "Business: Alaska's Bearclaw Lodge",
        'Industry: Trophy fishing and hunting lodge',
        'Location: King Salmon, Alaska',
        'Species / activities: King salmon, sockeye, halibut, brown bear, moose, caribou',
        'Audience / positioning: Trophy hunters and anglers seeking remote Alaska wilderness',
        'In business since: 1996'
      ].join('\n'),
      subject: "Alaska's Bearclaw Lodge + The Elite Compass",
      body: `Hi Dave,

Hope all's well up in King Salmon. Running kings and brown bear out of the same lodge means two very different seasons to staff and guide — I'd be curious how you manage that, and which one your repeat clients come back for.

How do you typically fill your season — repeat guests, word of mouth, agencies? I ask because I work with a hand-selected network of 70,000+ sportsmen and sportswomen booking trips like yours.

Would you have a few minutes on the phone in the next week or two to walk me through how the lodge works?

Cheers!`
    },
    {
      // Opener: "I came across…".  Door: how clients find them + share what I'm working on.  Close: work around their schedule.
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
      subject: 'A few questions about Cutthroat Anglers',
      body: `Hi Jordan,

I came across Cutthroat Anglers — a 4.8 across 200-plus reviews on that Silverthorne tailwater doesn't happen by accident. Most shops I know lean on either the guide side or the retail side; I'd love to hear how you've made both work.

How do most of your clients find you these days? The folks I work with are a hand-selected network of 70,000+ high-net-worth hunters and anglers who travel to book, and I'd also love to share a bit about what I'm working on.

Could we find a short window to talk? Happy to work around your schedule.

Cheers!`
    }
  ]
};
