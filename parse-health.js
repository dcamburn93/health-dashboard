require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { createInterface } = require('readline');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const xmlPath = process.argv[2];
if (!xmlPath) { console.error('Usage: node parse-health.js /path/to/export.xml'); process.exit(1); }
console.log('Parsing:', xmlPath);
const dailySteps={},dailyActiveCal={},dailyBasalCal={},dailyFlights={},dailyExerciseMin={},dailyStandHours={},dailySleepAsleep={},dailySleepInBed={},dailyRestingHR={},dailyHRV={},dailyMaxHR={},dailyWeight={},dailyBodyFat={},dailyVO2={};
let lines=0,records=0;
function parseRecord(line) {
  const tm=line.match(/type="([^"]+)"/); if(!tm) return;
  const dm=line.match(/startDate="([^"]+)"/); if(!dm) return;
  const date=dm[1].slice(0,10);
  const vm=line.match(/value="([^"]+)"/);
  const val=vm?parseFloat(vm[1]):NaN;
  records++;
  const t=tm[1];
  if(t==='HKQuantityTypeIdentifierStepCount') dailySteps[date]=(dailySteps[date]||0)+(isNaN(val)?0:val);
  else if(t==='HKQuantityTypeIdentifierActiveEnergyBurned') dailyActiveCal[date]=(dailyActiveCal[date]||0)+(isNaN(val)?0:val);
  else if(t==='HKQuantityTypeIdentifierBasalEnergyBurned') dailyBasalCal[date]=(dailyBasalCal[date]||0)+(isNaN(val)?0:val);
  else if(t==='HKQuantityTypeIdentifierFlightsClimbed') dailyFlights[date]=(dailyFlights[date]||0)+(isNaN(val)?0:val);
  else if(t==='HKQuantityTypeIdentifierAppleExerciseTime') dailyExerciseMin[date]=(dailyExerciseMin[date]||0)+(isNaN(val)?0:val);
  else if(t==='HKQuantityTypeIdentifierRestingHeartRate'&&!isNaN(val)) dailyRestingHR[date]=val;
  else if(t==='HKQuantityTypeIdentifierHeartRateVariabilitySDNN'&&!isNaN(val)){if(!dailyHRV[date])dailyHRV[date]=[];dailyHRV[date].push(val);}
  else if(t==='HKQuantityTypeIdentifierHeartRate'&&!isNaN(val)){if(!dailyMaxHR[date]||val>dailyMaxHR[date])dailyMaxHR[date]=val;}
  else if(t==='HKQuantityTypeIdentifierBodyMass'&&!isNaN(val)) dailyWeight[date]=val;
  else if(t==='HKQuantityTypeIdentifierBodyFatPercentage'&&!isNaN(val)) dailyBodyFat[date]=val*100;
  else if(t==='HKQuantityTypeIdentifierVO2Max'&&!isNaN(val)) dailyVO2[date]=val;
  else if(t==='HKCategoryTypeIdentifierSleepAnalysis'){
    if(!vm) return;
    const em=line.match(/endDate="([^"]+)"/); if(!em) return;
    const h=(new Date(em[1])-new Date(dm[1]))/3600000;
    if(h<=0||h>24) return;
    const v=vm[1];
    if(v.includes('Asleep')||v.includes('Core')||v.includes('Deep')||v.includes('REM')) dailySleepAsleep[date]=(dailySleepAsleep[date]||0)+h;
    else if(v.includes('InBed')) dailySleepInBed[date]=(dailySleepInBed[date]||0)+h;
  }
}
const rl=createInterface({input:fs.createReadStream(xmlPath,{encoding:'utf8'}),crlfDelay:Infinity});
rl.on('line',(line)=>{lines++;if(lines%500000===0)process.stdout.write(`  ${(lines/1e6).toFixed(1)}M lines...\r`);if(line.includes('<Record '))parseRecord(line);});
rl.on('close',async()=>{
  console.log(`\nParsed ${records.toLocaleString()} records from ${lines.toLocaleString()} lines\nUploading...`);
  const actDates=new Set([...Object.keys(dailySteps),...Object.keys(dailyActiveCal),...Object.keys(dailyFlights)]);
  await up('daily_activity',[...actDates].map(d=>({date:d,steps:Math.round(dailySteps[d]||0),active_calories:Math.round(dailyActiveCal[d]||0),total_calories:Math.round((dailyActiveCal[d]||0)+(dailyBasalCal[d]||0)),flights_climbed:Math.round(dailyFlights[d]||0),exercise_minutes:Math.round(dailyExerciseMin[d]||0),source:'apple_health'})),'date');
  const slDates=new Set([...Object.keys(dailySleepAsleep),...Object.keys(dailySleepInBed)]);
  await up('sleep',[...slDates].map(d=>({date:d,duration_h:parseFloat((dailySleepAsleep[d]||0).toFixed(2)),in_bed_h:parseFloat((dailySleepInBed[d]||0).toFixed(2)),source:'apple_health'})).filter(r=>r.duration_h>1),'date');
  const hrDates=new Set([...Object.keys(dailyRestingHR),...Object.keys(dailyHRV)]);
  await up('heart_rate',[...hrDates].map(d=>{const a=dailyHRV[d]||[];return{date:d,resting_hr:dailyRestingHR[d]?Math.round(dailyRestingHR[d]):null,hrv_ms:a.length?parseFloat((a.reduce((x,y)=>x+y,0)/a.length).toFixed(2)):null,max_hr:dailyMaxHR[d]?Math.round(dailyMaxHR[d]):null,source:'apple_health'};}).filter(r=>r.resting_hr||r.hrv_ms),'date');
  const bdDates=new Set([...Object.keys(dailyWeight),...Object.keys(dailyVO2)]);
  await up('body_metrics',[...bdDates].map(d=>({date:d,weight_lbs:dailyWeight[d]?parseFloat((dailyWeight[d]*2.20462).toFixed(2)):null,body_fat_pct:dailyBodyFat[d]?parseFloat(dailyBodyFat[d].toFixed(2)):null,vo2_max:dailyVO2[d]?parseFloat(dailyVO2[d].toFixed(2)):null,source:'apple_health'})).filter(r=>r.weight_lbs||r.vo2_max),'date');
  console.log('\nAll done! Check your Supabase tables.\n');
});
async function up(table,rows,conflict){
  if(!rows.length){console.log(`  ${table}: 0 rows`);return;}
  for(let i=0;i<rows.length;i+=500){const{error}=await supabase.from(table).upsert(rows.slice(i,i+500),{onConflict:conflict});if(error)console.error(`  ${table}:`,error.message);}
  console.log(`  ${table}: ${rows.length} rows`);
}
