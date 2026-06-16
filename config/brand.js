/**
 * config/brand.js — structured brand/voice profile for compose.js.
 * Human-readable source of truth lives in config/brand.md.
 * Swap this file (and config/client.js + .env) to retarget the engine.
 *
 * Getters on `sender`, `calendlyLink`, and `complianceFooter` are intentional:
 * process.env is read lazily at call time so dotenv is guaranteed to have loaded.
 */

export const BRAND_PROFILE = {
  name:    'The Elite Compass',
  website: 'https://theelitecompass.com',
  phone:   '303-625-7511',
  tagline: 'Where elite outfitters meet sportsmen & women who book',

  // ── What we sell ─────────────────────────────────────────────────────────────
  // Loaded into the system prompt so Claude understands the pitch.
  // ONLY figures from the 2026 Media Kit may appear here.
  product: `The Elite Compass is a monthly print magazine mailed directly to 70,000+ \
invitation-only, pre-vetted households — high-net-worth hunters, anglers, landowners, \
and collectors across North America. Key audience facts (2026 Media Kit):
- Average reader net worth: $2.5M+
- Average household income: $250K+
- 13 major metro markets: Houston, Dallas, Denver, Salt Lake City, Minneapolis, \
Detroit, Atlanta, Phoenix, Nashville, Baltimore, Philadelphia, Washington DC, New York
- Readers ages 25–70 who have traveled this year to hunt or fish
- Invitation-only, pre-vetted, curated list

Market context: $144.8B is spent annually on hunting and fishing in the US (USFWS 2022).

Every advertiser receives: a dedicated call-tracking number, a custom QR code to their \
landing page, monthly performance reporting, expert ad design consultation, and no large \
upfront payment — pay before each print run, 4-month minimum recommended.

Positioning: "A sportsman's show in your mailbox." Print sits on coffee tables, goes to \
camp, gets shared — unlike digital that disappears in seconds.`,

  // ── Voice ─────────────────────────────────────────────────────────────────────
  voice: `Write as Matt Royer, publisher of The Elite Compass — a peer in the \
hunting/angling world writing directly to a business owner. Confident, warm, and direct. \
Partner-not-vendor: you are not a salesperson pitching an ad buy, you are a curated \
publication inviting a worthy operation to be considered.

Rules:
- Lead with concrete proof early. Cite a real approved number (70,000+, $2.5M+ net worth, \
  $144.8B market) or a specific verified fact about their operation. Never vague claims \
  with no figure behind them ("we reach affluent hunters who spend heavily" with nothing \
  behind it is banned).
- Frame as an invitation: this operation is the caliber our readers book with, and we'd \
  like to feature/consider them. Selective, not a spray-and-pray pitch.
- Exclusivity language throughout: invitation-only, pre-vetted, curated, selective, \
  limited placements, operations of your caliber.
- A direct, confident challenge beats a timid ask. "The readers are doing their part — \
  now you need to do yours" is the right energy.
- End with "Cheers!" as the valediction. The system appends sender identity after the \
  body — do NOT write the sender's name, phone number, email, or booking link yourself.
- Short paragraphs. No filler. No stage-setting.`,

  // ── Email skeleton ────────────────────────────────────────────────────────────
  skeleton: {
    hook:    'One specific, verified fact from the enrichment data about their operation — \
connects their business to why the magazine\'s readers would book with them. No vague \
adjectives, no fabrication.',
    whyThem: '1–2 sentences: this operation is the caliber Elite Compass readers book with. \
Invitation framing — they\'ve been considered/selected, not cold-pitched.',
    proof:   '1–2 sentences using approved audience facts. At least one specific number \
must appear (70,000+, $2.5M+, $250K+, $144.8B). Make it undeniable.',
    cta:     'One firm, warm close inviting a call or reply. End the body with "Cheers!" — \
do NOT write sender name, phone, or booking link (system appends those).'
  },

  // ── Lazy getters ──────────────────────────────────────────────────────────────
  get sender() {
    return {
      name:    process.env.SENDER_NAME  ?? 'Matthew Royer',
      title:   process.env.SENDER_TITLE ?? 'Publisher',
      company: 'The Elite Compass'
    };
  },

  get calendlyLink() {
    return process.env.CALENDLY_LINK ?? null;
  },

  // Appended to every email body in code — not delegated to Claude
  get complianceFooter() {
    const name = process.env.SENDER_NAME ?? 'Matthew Royer';
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
    'hope to hear from you'
  ],

  lengthLimits: {
    subjectMaxChars: 75,
    bodyMaxWords:    200  // compliance footer not counted (added post-check)
  },

  // ── Few-shot examples ─────────────────────────────────────────────────────────
  // Show the invitation angle + approved facts + "Cheers!" valediction.
  // Do NOT use banned phrases or figures not in the approved list.
  exampleEmails: [
    {
      leadContext: [
        'Business: Worldwide Trophy Adventures',
        'Industry: International trophy hunting outfitter',
        'Location: Bozeman, Montana',
        'Species / activities: Whitetail, mule deer, elk, Africa safaris, New Zealand red stag',
        'Audience / positioning: High-net-worth hunters booking destination hunts on multiple continents',
        'In business since: 1985'
      ].join('\n'),
      subject: 'Worldwide Trophy Adventures — your client is reading The Elite Compass',
      body: `Forty years booking whitetail, elk, and Africa safaris for clients across North America is exactly the pedigree Elite Compass readers take seriously when they're planning a destination hunt.

We mail monthly to 70,000+ invitation-only households — average net worth $2.5M+, average income $250K+, hunters who've already traveled this year and are planning the next one. These aren't casual sportsmen browsing the internet; they're the clients who commit to the same outfitter for fifteen years.

We'd like to consider Worldwide Trophy Adventures for an upcoming issue. Happy to walk you through the format options on a short call.

Cheers!`
    },
    {
      leadContext: [
        "Business: Alaska's Bearclaw Lodge",
        'Industry: Trophy fishing and hunting lodge',
        'Location: King Salmon, Alaska',
        'Species / activities: King salmon, sockeye, halibut, brown bear, moose, caribou',
        'Audience / positioning: Trophy hunters and anglers seeking remote Alaska wilderness',
        'In business since: 1996'
      ].join('\n'),
      subject: "King salmon and brown bear — our readers are booking Alaska",
      body: `King salmon runs and brown bear in the Alaska Peninsula is the bucket-list trip The Elite Compass was built around.

We go to 70,000+ invitation-only, pre-vetted households every month — average net worth $2.5M+, readers who traveled this year to hunt or fish and are already planning the next one. Alaska trophy lodges are on their shortlist. The question is whether they find you first.

We'd like to feature Bearclaw Lodge in an upcoming issue. I can share the full media kit and walk through format options on a short call.

Cheers!`
    },
    {
      leadContext: [
        "Business: Cutthroat Anglers",
        'Industry: Fly fishing guide service and fly shop',
        'Location: Silverthorne, Colorado',
        'Species / activities: Brown trout, rainbow trout, cutthroat, fly fishing, wading',
        'Audience / positioning: Serious fly fishermen seeking Colorado tailwater and alpine fishing',
        'In business since: 1996',
        'Google rating: 4.8 (200+ reviews)'
      ].join('\n'),
      subject: "Colorado tailwater trout — 70,000 readers are planning their trip",
      body: `Colorado tailwater fishing and 4.8-star reviews from over 200 clients puts Cutthroat Anglers exactly where Elite Compass readers look when they're booking a Western fly fishing trip.

Our readers are 70,000+ invitation-only subscribers with an average household income of $250K+ — they travel specifically to fish and they spend seriously on guides. They've already committed to the experience; they just need to find the right operation.

We'd like to consider Cutthroat Anglers for an upcoming issue. Drop me a reply and I'll get you the full media kit.

Cheers!`
    }
  ]
};
