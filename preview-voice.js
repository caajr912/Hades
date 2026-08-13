import 'dotenv/config';
import { composeDraft } from './compose.js';

/**
 * Voice preview — runs ONLY the email composer against sample leads so Matt can
 * read real drafts in the new voice before anything touches Apollo, Instantly, or
 * the database. No pull, no send, no queue. Just the copy.
 *
 * Run:   node preview-voice.js
 * Save:  node preview-voice.js > voice-preview.txt   (then forward the file)
 *
 * NOTE: each lead's opener/close/subject style is assigned by hashing its email,
 * so the drafts should NOT rhyme — read them together and check they vary. These
 * six emails were picked to surface all three openers, closes, and subject formats.
 * If you swap in your own leads, the styles reassign automatically.
 */
const sampleLeads = [
  {
    firstName: 'Sam', lastName: 'Whitaker', email: 'sam@ridgelineoutfitters.example',
    companyName: 'Ridgeline Outfitters',
    companyIndustry: 'Backcountry elk and mule deer outfitter',
    city: 'Gunnison', state: 'CO',
    companyDescription: 'Family-run wilderness outfitter running horseback pack-in elk and mule deer hunts in the Colorado high country.',
    speciesOrActivities: 'Elk, mule deer, backcountry pack-in hunts',
    yearsInBusiness: 1998,
    audiencePositioning: 'Serious hunters seeking guided wilderness hunts on public land',
    title: 'Owner', seniority: 'owner'
  },
  {
    firstName: 'Dana', lastName: 'Cole', email: 'dana@saltwaterrepublic.example',
    companyName: 'Saltwater Republic Charters',
    companyIndustry: 'Offshore and flats fishing charter',
    city: 'Islamorada', state: 'FL',
    companyDescription: 'Full-service Keys charter operation running tarpon, permit, and offshore trips out of Islamorada.',
    speciesOrActivities: 'Tarpon, permit, bonefish, offshore',
    yearsInBusiness: 2007,
    audiencePositioning: 'Anglers chasing Keys flats slams and bluewater',
    title: 'Captain / Owner', seniority: 'owner'
  },
  {
    firstName: 'Marcus', lastName: 'Boone', email: 'marcus@northforkwing.example',
    companyName: 'North Fork Wingshooting',
    companyIndustry: 'Upland bird and waterfowl guide service',
    city: 'Aberdeen', state: 'SD',
    companyDescription: 'Guided pheasant, sharptail, and waterfowl hunts over pointing dogs on private South Dakota ground.',
    speciesOrActivities: 'Pheasant, sharptail grouse, waterfowl, upland over dogs',
    yearsInBusiness: 2012,
    audiencePositioning: 'Wingshooters seeking classic Dakota prairie hunts',
    title: 'Head Guide / Owner', seniority: 'owner'
  },
  {
    firstName: 'Kate', lastName: 'Merrill', email: 'kate@highdesertwing.example',
    companyName: 'High Desert Wingshooting',
    companyIndustry: 'Upland bird guide service',
    city: 'Burns', state: 'OR',
    companyDescription: 'Guided chukar, quail, and Hungarian partridge hunts across high-desert public and private ground in eastern Oregon.',
    speciesOrActivities: 'Chukar, valley quail, Hungarian partridge, upland over dogs',
    yearsInBusiness: 2010,
    audiencePositioning: 'Upland hunters chasing wild chukar in rugged country',
    title: 'Owner / Guide', seniority: 'owner'
  },
  {
    firstName: 'Travis', lastName: 'Hale', email: 'travis@bristolbaylodge.example',
    companyName: 'Bristol Bay Lodge',
    companyIndustry: 'Remote fly-in fishing lodge',
    city: 'Dillingham', state: 'AK',
    companyDescription: 'Fly-out lodge on Bristol Bay running trophy rainbow trout, sockeye, and king salmon trips across remote Alaska rivers.',
    speciesOrActivities: 'Rainbow trout, sockeye, king salmon, grayling, fly-out fishing',
    yearsInBusiness: 1972,
    audiencePositioning: 'Anglers booking bucket-list remote Alaska fly-fishing',
    title: 'Owner', seniority: 'owner'
  },
  {
    firstName: 'Clay', lastName: 'Dawson', email: 'clay@mesaverdehunts.example',
    companyName: 'Mesa Verde Hunts',
    companyIndustry: 'Guided big-game hunting outfitter',
    city: 'Cortez', state: 'CO',
    companyDescription: 'Guided elk, mule deer, and pronghorn hunts on private ranches and public land in southwest Colorado.',
    speciesOrActivities: 'Elk, mule deer, pronghorn, private-land big game',
    yearsInBusiness: 2004,
    audiencePositioning: 'Big-game hunters seeking guided private-land access',
    title: 'Owner / Outfitter', seniority: 'owner'
  }
];

console.log(`\nComposing ${sampleLeads.length} preview drafts in the new voice...\n`);

for (const lead of sampleLeads) {
  try {
    const draft = await composeDraft(lead);
    console.log('='.repeat(72));
    console.log(`${lead.companyName}  —  to ${lead.firstName}`);
    console.log('-'.repeat(72));
    console.log(`Subject: ${draft.subject}\n`);
    console.log(draft.body);
    console.log('');
  } catch (err) {
    console.log('='.repeat(72));
    console.log(`${lead.companyName} — FAILED: ${err.message}`);
    console.log('');
  }
}
