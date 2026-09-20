# District resident life

The district's 24 characters walk between public storefront stops, pause when a visitor approaches, and remain still during a conversation. **Pause resident walks** freezes ambient strolls without disabling conversations or altering community resources. Reduced-motion preference starts those strolls paused; the user can explicitly resume them. Active volunteer visits follow the community scenario controls instead, so reduced motion does not disable the support objective.

The existing cast keeps its first-person River Oaks backgrounds, interests, routines and encounter memory. Ima Hogg, Barbara Jordan, Hakeem Olajuwon and Beyoncé are labeled fictional cultural encounters, with public biography links and generic character meshes and voices. These roles do not assert anyone's actual residence, private routine or endorsement. Dialogue remains authored; Jev classifies immediate actions.

## Movement and decisions

Short routes connect the public stops in `district.json`. A lazy two-meter navigation grid rejects source footprints, the site boundary, terrain discontinuities and the rendered tree supports. Segment checks run at intervals of at most 20 cm. The entire grid is capped at 40,000 cells, with 15,000 search visits per route. It is available only in the bounded district scene.

The browser runs route searches in one Web Worker with one outstanding query and a two-second deadline. Replacing the scene terminates its worker. Movement runs locally at 1.05–1.26 m/s, capped for long frame gaps, with nearby-person separation and short passing steps. Conversation partners and strolling residents within 2.8 meters of a walking visitor stop. Working volunteers continue past a visitor while respecting collision clearance; starting a conversation holds them. Clothed skeletons use a procedural stride driven by actual distance traveled, with independently oriented joint axes and restrained arm motion.

Every two seconds, a single batch carries up to 24 residents' current positions, activity, weather, nearby people and bounded role context to the loopback decision bridge. Conversations have their existing separate foreground request. A resident batch has a 1.8-second browser deadline; generation, storm revision, tick, age and complete response validation fence its application. Hidden tabs do not request reactions. With ambient strolls paused, only active volunteers receive background reactions. The movement loop supplies local fallback, and accepted source counts remain explicit. No Jev key is shipped to the browser.

The economic **Thunderstorm disruption** control also changes resident behavior before an economic run begins. Residents seek the small awnings represented in the interpreted storefront meshes; clearing the storm resumes their walks. Humid haze reduces walking speed; the late-night clock pauses outdoor activity. Ambient strolling does not spend supplies or advance the community scenario clock.

## Physical volunteer visits

**Dispatch help** reserves one visit and recruits an available resident who has no open support request. The same character walks a collision-checked route to within 1.45 meters of the recipient, carrying an original procedural supply bag. **Find volunteer** places the visitor near the helper without opening a conversation. Starting a conversation with the helper pauses their movement and on-site work; their greeting names the actual recipient and task.

On-site support requires the assigned helper to remain within 1.5 meters. Only then does the scenario's service time advance at the configured staffing rate. A timer, a Jev answer or a claimed arrival phase cannot complete a distant visit. Recipients wait for the helper unless a storm sends them toward cover; once it clears, the helper replans to the recipient's current location. Storms hold progress, while unmet need continues to grow. If every available helper route is inaccessible, the unused visit returns once and the request remains unresolved.

Volunteer routing shares the existing worker and character pool; it does not add extra people or parallel route backlogs. Scene replacement and scenario resets discard old assignments and late route results. The smaller district uses physical visits; the larger neighborhood source preview retains its abstract service timers. All travel, needs, staffing effects and outcomes are fictional simulation rules.

## Verification and limits

`navigation.test.js`, `resident-life.test.js`, `volunteer-visits.test.js` and `gait.test.js` cover footprint/trunk avoidance, physical arrival, unreachable-visit refunds, bounded speed, pedestrian passing, conversation holds, pause/resume, storm transitions, task context, temporary-action expiry and stale route/decision rejection. The browser scripts `preview/e2e/resident-life.js` and `volunteer-visits.js` operate actual controls, observe the navigation worker and resident packets, and check conversations, weather, reduced motion, visible bags, completed support and the UHD buffer.

Routes are simulation interpretations of the space between source footprints, not surveyed pedestrian permissions or a lane-aware traffic network. The awnings are visual cover in this scene, not verified emergency shelters. Local passing is not a production crowd solver, and the stride is procedural rather than captured animation or foot IK. This pass covers 24 browser characters; it does not establish 500-person rendering, live Jev throughput, UE5 execution or target-hardware 4K/60 fps.
