# Settlement Schedule Reflow

Reschedules settlement tasks around dependencies, channel conflicts, operating hours and blackout windows.

Needs Node 24+.

```bash
npm install
npm start                              # run all scenarios
npm run scenario -- 01-delay-cascade   # run one
npm test
```

Scenarios live in `data/scenarios/*.json`. Add a file there and it gets picked up. All dates are UTC.
