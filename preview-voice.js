import 'dotenv/config';
import { composeDraft } from './compose.js';

/**
 * Voice preview — runs ONLY the email composer against a few sample leads so
 * Matt can read real drafts in the new voice before anything touches Apollo,
 * Instantly, or the database. No pull, no send, no queue. Just the copy.
 *
 * Run:   node preview-voice.js
 * Save:  node preview-voice.js > voice-preview.txt   (then forward the file)
 *
 * These sample leads mimic the shape the real pipeline produces after
 * enrichment. Edit them or add your own to test specific cases.
 */
const sampleLeads = [
  {
    firstName: 'Sam',
    lastName: 'Whitaker',
    email: 'sam@ridgelineoutfitters.example',
    companyName: 'Ridgeline Outfitters',
    companyIndustry: 'Backcountry elk and mule deer outfitter',
    city: 'Gunnison',
    state: 'CO',
    companyDescription:
      'Family-run wilderness outfitter running horseback pack-in elk and mule deer hunts in the Colorado high country.',
    speciesOrActivities: 'Elk, mule deer, backcountry pack-in hunts',
    yearsInBusiness: 1998,
    audiencePositioning: 'Serious hunters seeking guided wilderness hunts on public land',
    title: 'Owner',
    seniority: 'owner'
  },
  {
    firstName: 'Dana',
    lastName: 'Cole',
    email: 'dana@saltwaterrepublic.example',
    companyName: 'Saltwater Republic Charters',
    companyIndustry: 'Offshore and flats fishing charter',
    city: 'Islamorada',
    state: 'FL',
    companyDescription:
      'Full-service Keys charter operation running tarpon, permit, and offshore trips out of Islamorada.',
    speciesOrActivities: 'Tarpon, permit, bonefish, offshore',
    yearsInBusiness: 2007,
    audiencePositioning: 'Anglers chasing Keys flats slams and bluewater',
    title: 'Captain / Owner',
    seniority: 'owner'
  },
  {
    firstName: 'Marcus',
    lastName: 'Boone',
    email: 'marcus@northforkwing.example',
    companyName: 'North Fork Wingshooting',
    companyIndustry: 'Upland bird and waterfowl guide service',
    city: 'Aberdeen',
    state: 'SD',
    companyDescription:
      'Guided pheasant, sharptail, and waterfowl hunts over pointing dogs on private South Dakota ground.',
    speciesOrActivities: 'Pheasant, sharptail grouse, waterfowl, upland over dogs',
    yearsInBusiness: 2012,
    audiencePositioning: 'Wingshooters seeking classic Dakota prairie hunts',
    title: 'Head Guide / Owner',
    seniority: 'owner'
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
