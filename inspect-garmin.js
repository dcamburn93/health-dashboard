// inspect-garmin.js — shows what data is actually in your FIT files
const fs = require('fs');
const path = require('path');
const FitParser = require('fit-file-parser').default;

const fitDir = process.argv[2] || '.';
const files = fs.readdirSync(fitDir).filter(f => f.toLowerCase().endsWith('.fit'));

files.forEach(file => {
  const buf = fs.readFileSync(path.join(fitDir, file));
  const parser = new FitParser({ force: true, mode: 'cascade' });
  parser.parse(buf, (err, data) => {
    if (err) { console.log(`${file}: ERROR ${err.message}`); return; }
    const keys = Object.keys(data).filter(k => data[k]?.length > 0);
    console.log(`\n=== ${file} ===`);
    keys.forEach(k => {
      console.log(`  ${k} (${data[k].length} records)`);
      if (data[k].length > 0) {
        console.log(`    Sample:`, JSON.stringify(data[k][0]).slice(0, 200));
      }
    });
  });
});
