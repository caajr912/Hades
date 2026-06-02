/**
 * config/brand.js — brand and voice profile for this deployment.
 * Swap this file (and config/client.js + .env) to retarget the engine for a different client.
 *
 * Getters on `sender` and `complianceFooter` are intentional: process.env is read lazily
 * at call time (during request processing) so dotenv is guaranteed to have loaded first.
 */

export const BRAND_PROFILE = {
  name:    'The Elite Compass',
  website: 'https://theelitecompass.com',
  phone:   '(303) 625-7511',
  tagline: 'the premium magazine for affluent hunters and anglers',

  // What we sell — used in the system prompt so Claude understands the pitch
  product: `We sell advertising space in The Elite Compass — a premium print + digital \
magazine distributed to affluent hunters and anglers across the US. Our readers are \
high-intent sportsmen with disposable income who spend heavily on quality experiences, \
gear, and travel. Advertisers get a curated audience that has already self-selected as \
their ideal buyer.`,

  // Voice and tone — loaded into every generation
  voice: `Write as a fellow industry insider speaking peer-to-peer with a business owner \
who knows the outdoors world. Confident, direct, and warm. Never corporate or salesy. \
Short sentences, active voice, specific details over generic claims. If the facts are \
compelling, let them do the work.`,

  // Email skeleton — each section gets exactly the described treatment
  skeleton: {
    hook:    "One sentence grounded in a verified Clay fact about their specific operation — connects their business to the magazine's audience without naming the magazine.",
    whyThem: "1–2 sentences on why their operation is a natural fit for our readers: audience match, buyer intent, spending power.",
    offer:   "1–2 sentences on what advertising in The Elite Compass actually delivers. Be specific — reach, audience quality, print + digital formats.",
    cta:     "One soft close asking for a call or reply. No urgency, no hard sell."
  },

  // Lazy getter — reads env vars at call time, not module-load time
  get sender() {
    return {
      name:    process.env.SENDER_NAME    ?? 'Your Name',
      title:   process.env.SENDER_TITLE   ?? 'Advertising Partnerships',
      company: 'The Elite Compass'
    };
  },

  // Appended to every email body in code — not delegated to Claude
  get complianceFooter() {
    const name = process.env.SENDER_NAME ?? 'Your Name';
    return (
      `\n\n— ${name}, The Elite Compass` +
      `\n${this.phone} · ${this.website}` +
      `\n\nTo unsubscribe, reply "unsubscribe".`
    );
  },

  // Hard rules — enforced in compose.js after generation
  bannedPhrases: [
    'i hope this email finds you',
    'i hope this finds you',
    'i wanted to reach out',
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
    'as per my last'
  ],

  lengthLimits: {
    subjectMaxChars: 75,
    bodyMaxWords:    175   // compliance footer words not counted (added post-check)
  },

  // Few-shot examples — teach Claude the voice and structure before it writes
  exampleEmails: [
    {
      leadContext: [
        'Business: High Plains Whitetail Outfitters',
        'Industry: Guided hunting',
        'Location: Pierre, South Dakota',
        'Google rating: 4.9 (87 reviews)',
        'Species / activities: Whitetail deer, mule deer, pheasant',
        'In business since: 2008',
        'Recent review: "Trophy quality deer and exceptional hospitality — best hunt of my life"'
      ].join('\n'),
      subject: 'Your South Dakota hunters — our readers are looking for you',
      body: `Sixteen years of 4.9-star whitetail hunts in South Dakota is exactly the track record our readers take seriously when they're planning a trip.

The Elite Compass reaches affluent hunters across the country who've already committed to spending on a quality experience — they just need to find the right operation. High Plains Whitetail is what they're searching for.

We offer print and digital placements that put your lodge in front of this audience during their booking window. Happy to share our reader demographics and past advertiser results.

Worth a quick call this week?`
    },
    {
      leadContext: [
        'Business: Ridgeline Optics',
        'Industry: Hunting optics / gear',
        'Location: Bozeman, Montana',
        'Product category: Hunting scopes and rangefinders',
        'Recent launches: STORM series rangefinder (Q1 2025)',
        'Social following: 42,000 Instagram followers'
      ].join('\n'),
      subject: 'STORM series — our readers are your buyer',
      body: `Hunters serious enough to follow you at 42K on Instagram are exactly who subscribes to The Elite Compass.

Our readers are high-income sportsmen who research their gear obsessively before they buy — premium optics are one of their highest annual spend categories. The STORM launch belongs in the editorial environment they trust.

We have print, digital, and sponsored content placements that work well alongside gear releases. I can send a media kit right now.

Worth a quick conversation?`
    }
  ]
};
