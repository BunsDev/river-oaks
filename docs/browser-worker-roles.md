# Browser worker roles

You can ask every worker about their occupation, hear a detail from their work, and return for a workplace greeting. The current district contains 62 workers in 22 roles. They share seven physical task families.

Start the browser preview, visit a worker through the people directory, then choose **About your work** or **A detail from your work**. Closing the conversation lets the worker resume the task. Guests keep the ordinary conversation topics.

Workers and guests now use short, varied conversational nods with quiet pauses.
Local voice playback drives the speaking cadence; muting returns to subtler
listening responses. These motions preserve worker hand contacts and planted
feet. Independently timed eyelid animation gives workers and guests natural
pauses between blinks, including while telekinetically held. Hidden rooms suspend
the facial clock. Separate eye pivots track Jevica during conversation and
while lifted, compensating for head movement within a limited range. Reduced
motion disables the added nods and blinking but keeps purposeful eye tracking. Lip
synchronization and broader facial expression remain open. Jevica now reciprocates
conversation attention: her head and eyes track the worker, with a gradual body
turn when she is standing on foot. Closing dialogue releases attention and
returns manual walking control.

```sh
npm run dev -- --host 127.0.0.1 --port 5181 --strictPort
```

## Role and task index

The table follows the current room plans and worker identities. Venue-by-venue records and browser results are in [the worker role report](../data/reports/browser-worker-roles.json).

| Occupation | Workers | Task families | Work context |
| --- | ---: | --- | --- |
| Bartender | 5 | `tablet` | reviewing bar orders and coordinating drink service |
| Cinema host | 1 | `tablet` | welcoming cinema guests and checking lobby information |
| Colorist | 1 | `samples` | comparing color samples and discussing tone |
| Counter attendant | 1 | `samples` | welcoming counter guests and presenting flavor choices |
| Eyewear stylist | 1 | `eyewear` | comparing frame shapes, colors and proportions |
| Fitness trainer | 1 | `tablet` | reviewing movement sessions and welcoming studio members |
| Fragrance consultant | 1 | `blotter` | presenting scent blotters and discussing fragrance impressions |
| Gallery guide | 1 | `tablet` | welcoming gallery visitors and discussing artwork |
| Gelato maker | 1 | `samples` | comparing gelato flavors, texture and presentation |
| Hair stylist | 1 | `samples` | comparing hair samples and discussing shape and movement |
| Host | 5 | `tablet` | welcoming dining guests and keeping track of the room |
| Jewelry adviser | 4 | `jewelry` | presenting jewelry and examining its setting and finish |
| Leather goods specialist | 2 | `fabric` | comparing material samples, stitching and accessory details |
| Optical associate | 1 | `eyewear` | examining eyewear construction and frame details |
| Perfumer | 1 | `blotter` | considering scent notes, balance and how fragrances develop |
| Projection technician | 1 | `tablet` | reviewing projection and sound checks |
| Salon host | 1 | `samples` | welcoming salon guests and helping consultations begin |
| Server | 5 | `tray` | carrying service trays and attending to dining guests |
| Studio host | 1 | `tablet` | welcoming studio members and organizing the shared space |
| Style adviser | 12 | `fabric` | comparing fabrics and helping visitors put an outfit together |
| Tailor | 11 | `fabric` | examining fabric, seams and garment proportions |
| Watch specialist | 4 | `jewelry` | examining watch details and discussing their construction |

## Source and checks

- [`worker-roles.js`](../preview/src/worker-roles.js) contains authored work descriptions, routines, and stories. It includes three additional catalog roles that the current room plans do not instantiate: Client adviser, Art adviser, and Concession attendant.
- [`store-encounters.js`](../preview/src/store-encounters.js) assigns an occupation by staff order and keeps its identity aligned with the rendered person.
- [`work-props.js`](../preview/src/work-props.js) assigns physical tasks by room theme and station pose.
- [`worker-roles.js` browser check](../preview/e2e/worker-roles.js) visits every rendered worker, exercises both work topics and the return greeting, checks the task type, and verifies conversation pause and work resumption. It also checks that a guest keeps guest topics.

The dialogue describes fictional work. It does not offer real tenant bookings, inventory, or transactions. This role index covers dialogue and task assignment; the motion/contact reports and live visual review cover movement quality.
