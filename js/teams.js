/* ============================================================
   TEAM DATABASE  —  FBS alignment used by CFB 26/27
   Format:  id | School | Mascot | ABBR | Conference | primary | secondary
   Colors are editable in the app (gear icon on any seeded team).
   ============================================================ */

const TEAM_RAW = `
alabama|Alabama|Crimson Tide|ALA|SEC|#A8042D|#FFFFFF
arkansas|Arkansas|Razorbacks|ARK|SEC|#A51E37|#FFFFFF
auburn|Auburn|Tigers|AUB|SEC|#001F4C|#FF6402
florida|Florida|Gators|UF|SEC|#002D88|#FB440F
georgia|Georgia|Bulldogs|UGA|SEC|#D80100|#FFFFFF
kentucky|Kentucky|Wildcats|UK|SEC|#002FA2|#FFFFFF
lsu|LSU|Tigers|LSU|SEC|#4E2784|#FFC324
olemiss|Ole Miss|Rebels|MISS|SEC|#13213C|#CC1130
missstate|Mississippi State|Bulldogs|MSST|SEC|#5D1020|#FFFFFF
missouri|Missouri|Tigers|MIZ|SEC|#F1BA29|#000000
oklahoma|Oklahoma|Sooners|OU|SEC|#890002|#FFFFFF
southcarolina|South Carolina|Gamecocks|SC|SEC|#76000C|#21201E
tennessee|Tennessee|Volunteers|TENN|SEC|#F77E02|#FFFFFF
texas|Texas|Longhorns|TEX|SEC|#B44E2D|#FFFFFF
texasam|Texas A&M|Aggies|A&M|SEC|#500000|#FFFFFF
vanderbilt|Vanderbilt|Commodores|VANDY|SEC|#D0BA89|#000000

illinois|Illinois|Fighting Illini|ILL|Big Ten|#E94B37|#14284B
indiana|Indiana|Hoosiers|IND|Big Ten|#990100|#FFFFFF
iowa|Iowa|Hawkeyes|IOWA|Big Ten|#F4CA16|#000000
maryland|Maryland|Terrapins|MD|Big Ten|#E31130|#FFD300
michigan|Michigan|Wolverines|MICH|Big Ten|#00274A|#FFCF07
michiganstate|Michigan State|Spartans|MSU|Big Ten|#18453B|#FFFFFF
minnesota|Minnesota|Golden Gophers|MINN|Big Ten|#5F102E|#FDC325
nebraska|Nebraska|Cornhuskers|NEB|Big Ten|#DD1B36|#FFFFFF
northwestern|Northwestern|Wildcats|NU|Big Ten|#59088F|#FFFFFF
ohiostate|Ohio State|Buckeyes|OSU|Big Ten|#BA0000|#666666
oregon|Oregon|Ducks|ORE|Big Ten|#004F28|#FFF000
pennstate|Penn State|Nittany Lions|PSU|Big Ten|#002E62|#FFFFFF
purdue|Purdue|Boilermakers|PUR|Big Ten|#B2946B|#000000
rutgers|Rutgers|Scarlet Knights|RUT|Big Ten|#D00829|#FFFFFF
ucla|UCLA|Bruins|UCLA|Big Ten|#007EC3|#FDB827
usc|USC|Trojans|USC|Big Ten|#951D32|#FFC828
washington|Washington|Huskies|UW|Big Ten|#2F0067|#E9D5A3
wisconsin|Wisconsin|Badgers|WIS|Big Ten|#B40024|#FFFFFF

arizona|Arizona|Wildcats|ARIZ|Big 12|#001B5C|#C2002C
arizonastate|Arizona State|Sun Devils|ASU|Big 12|#7A0C2F|#FFC422
baylor|Baylor|Bears|BAY|Big 12|#004834|#FEBB30
byu|BYU|Cougars|BYU|Big 12|#001C54|#003EB1
cincinnati|Cincinnati|Bearcats|CIN|Big 12|#E2001D|#000000
colorado|Colorado|Buffaloes|COLO|Big 12|#D0B87D|#000000
houston|Houston|Cougars|HOU|Big 12|#C8102E|#FFFFFF
iowastate|Iowa State|Cyclones|ISU|Big 12|#960023|#F9AE0D
kansas|Kansas|Jayhawks|KU|Big 12|#0051BC|#E90004
kansasstate|Kansas State|Wildcats|KSU|Big 12|#512888|#FFFFFF
oklahomastate|Oklahoma State|Cowboys|OKST|Big 12|#FF5C00|#000000
tcu|TCU|Horned Frogs|TCU|Big 12|#4F2683|#E6E7E8
texastech|Texas Tech|Red Raiders|TTU|Big 12|#CD0000|#000000
ucf|UCF|Knights|UCF|Big 12|#B9A569|#000000
utah|Utah|Utes|UTAH|Big 12|#CD0000|#FFFFFF
westvirginia|West Virginia|Mountaineers|WVU|Big 12|#012753|#E8AD1C

bostoncollege|Boston College|Eagles|BC|ACC|#8E1C2F|#DCCEA6
california|California|Golden Bears|CAL|ACC|#02264A|#F5C035
clemson|Clemson|Tigers|CLEM|ACC|#F56700|#3B1E72
duke|Duke|Blue Devils|DUKE|ACC|#092F87|#FFFFFF
floridastate|Florida State|Seminoles|FSU|ACC|#782F40|#CFB988
georgiatech|Georgia Tech|Yellow Jackets|GT|ACC|#002C56|#A5805A
louisville|Louisville|Cardinals|LOU|ACC|#CA0019|#FEBB0C
miami|Miami|Hurricanes|MIA|ACC|#E95700|#004E2E
ncstate|NC State|Wolfpack|NCST|ACC|#CD0000|#000000
northcarolina|North Carolina|Tar Heels|UNC|ACC|#77A9CE|#112849
pittsburgh|Pittsburgh|Panthers|PITT|ACC|#003295|#FFBA15
smu|SMU|Mustangs|SMU|ACC|#E80132|#002E9F
stanford|Stanford|Cardinal|STAN|ACC|#8D1515|#007762
syracuse|Syracuse|Orange|SYR|ACC|#F14F23|#091F40
virginia|Virginia|Cavaliers|UVA|ACC|#232B42|#FC5A1D
virginiatech|Virginia Tech|Hokies|VT|ACC|#6E2A3D|#D74B29
wakeforest|Wake Forest|Demon Deacons|WAKE|ACC|#D0BA89|#000000

oregonstate|Oregon State|Beavers|ORST|Pac-12|#DD4200|#000000
washingtonstate|Washington State|Cougars|WSU|Pac-12|#991E32|#FFFFFF

notredame|Notre Dame|Fighting Irish|ND|Independent|#011142|#9D8839
uconn|UConn|Huskies|CONN|Independent|#0B2240|#EB092A

army|Army|Black Knights|ARMY|American|#D8BA8A|#18191D
charlotte|Charlotte|49ers|CLT|American|#006A3E|#9C8847
eastcarolina|East Carolina|Pirates|ECU|American|#582884|#FFD80E
fau|Florida Atlantic|Owls|FAU|American|#CD0000|#002F67
memphis|Memphis|Tigers|MEM|American|#074389|#9FA1A2
navy|Navy|Midshipmen|NAVY|American|#002058|#D2C38D
northtexas|North Texas|Mean Green|UNT|American|#00853E|#FFFFFF
rice|Rice|Owls|RICE|American|#091C5B|#FFFFFF
southflorida|South Florida|Bulls|USF|American|#00392A|#C3B163
temple|Temple|Owls|TEM|American|#940031|#FFFFFF
tulane|Tulane|Green Wave|TULN|American|#005834|#01A5D8
tulsa|Tulsa|Golden Hurricane|TLSA|American|#002F67|#A59C68
uab|UAB|Blazers|UAB|American|#007149|#D91D40
utsa|UTSA|Roadrunners|UTSA|American|#002344|#E46B2B

delaware|Delaware|Blue Hens|DEL|C-USA|#00539F|#FFD200
fiu|Florida International|Panthers|FIU|C-USA|#081E3F|#B6862D
jacksonvillestate|Jacksonville State|Gamecocks|JVST|C-USA|#CC0000|#FFFFFF
kennesawstate|Kennesaw State|Owls|KENN|C-USA|#FFC629|#000000
liberty|Liberty|Flames|LIB|C-USA|#092643|#9A0000
louisianatech|Louisiana Tech|Bulldogs|LT|C-USA|#002D88|#CC3039
middletennessee|Middle Tennessee|Blue Raiders|MTSU|C-USA|#0067A4|#FFFFFF
missouristate|Missouri State|Bears|MOST|C-USA|#5E0009|#FFFFFF
newmexicostate|New Mexico State|Aggies|NMSU|C-USA|#8B090E|#FFFFFF
samhouston|Sam Houston|Bearkats|SHSU|C-USA|#F26522|#FFFFFF
utep|UTEP|Miners|UTEP|Mountain West|#041E42|#FF8201
westernkentucky|Western Kentucky|Hilltoppers|WKU|C-USA|#C4013C|#FFFFFF

akron|Akron|Zips|AKR|MAC|#00275F|#FFFFFF
ballstate|Ball State|Cardinals|BALL|MAC|#BA0C2F|#FFFFFF
bowlinggreen|Bowling Green|Falcons|BGSU|MAC|#F15C26|#542E1C
buffalo|Buffalo|Bulls|BUFF|MAC|#005BBB|#FFFFFF
centralmichigan|Central Michigan|Chippewas|CMU|MAC|#4B0124|#FEAF30
easternmichigan|Eastern Michigan|Eagles|EMU|MAC|#0F6838|#FFFFFF
kentstate|Kent State|Golden Flashes|KENT|MAC|#1E3C72|#ECAA23
miamioh|Miami (OH)|RedHawks|M-OH|MAC|#D40124|#FFFFFF
northernillinois|Northern Illinois|Huskies|NIU|Mountain West|#BA0C2F|#000000
ohio|Ohio|Bobcats|OHIO|MAC|#006A4D|#E5BD87
toledo|Toledo|Rockets|TOL|MAC|#002047|#FFCE04
umass|UMass|Minutemen|UMASS|MAC|#A50C31|#FFFFFF
westernmichigan|Western Michigan|Broncos|WMU|MAC|#6D4022|#B8A46A

airforce|Air Force|Falcons|AF|Mountain West|#005DAB|#FFFFFF
boisestate|Boise State|Broncos|BSU|Pac-12|#002FA2|#FB440F
coloradostate|Colorado State|Rams|CSU|Pac-12|#184C27|#C9C573
fresnostate|Fresno State|Bulldogs|FRES|Pac-12|#D12130|#14284D
hawaii|Hawaii|Rainbow Warriors|HAW|Mountain West|#00632C|#B8B8B8
nevada|Nevada|Wolf Pack|NEV|Mountain West|#021D42|#FFFFFF
newmexico|New Mexico|Lobos|UNM|Mountain West|#BC032C|#FFFFFF
sandiegostate|San Diego State|Aztecs|SDSU|Pac-12|#C41230|#FFFFFF
sanjosestate|San Jose State|Spartans|SJSU|Mountain West|#0035AA|#FFBA12
unlv|UNLV|Rebels|UNLV|Mountain West|#E61A38|#000000
utahstate|Utah State|Aggies|USU|Pac-12|#113257|#FFFFFF
wyoming|Wyoming|Cowboys|WYO|Mountain West|#533528|#FEC524

appstate|Appalachian State|Mountaineers|APP|Sun Belt|#FFD205|#000000
arkansasstate|Arkansas State|Red Wolves|ARST|Sun Belt|#D02130|#000000
coastalcarolina|Coastal Carolina|Chanticleers|CCU|Sun Belt|#006F72|#000000
georgiasouthern|Georgia Southern|Eagles|GASO|Sun Belt|#00183F|#89714C
georgiastate|Georgia State|Panthers|GAST|Sun Belt|#0133A0|#CD112C
jamesmadison|James Madison|Dukes|JMU|Sun Belt|#450084|#CBB677
louisiana|Louisiana|Ragin' Cajuns|UL|Sun Belt|#FFFFFF|#D2152A
ulmonroe|UL Monroe|Warhawks|ULM|Sun Belt|#810028|#F6B312
marshall|Marshall|Thundering Herd|MRSH|Sun Belt|#046330|#000000
olddominion|Old Dominion|Monarchs|ODU|Sun Belt|#003769|#FFFFFF
southalabama|South Alabama|Jaguars|USA|Sun Belt|#00205C|#BF0D3E
southernmiss|Southern Miss|Golden Eagles|USM|Sun Belt|#030003|#FFC527
texasstate|Texas State|Bobcats|TXST|Pac-12|#571C1F|#AD9256
troy|Troy|Trojans|TROY|Sun Belt|#6D0017|#FFFFFF
`;

/* ---------------------------------------------------------------------
   MARKS — the letters a school's own logo actually uses.
   Without a logo file the crest draws this as a monogram, which is much
   closer to the real plate than spelling the school out. Anything not
   listed falls back to its abbreviation.
   ------------------------------------------------------------------- */
const TEAM_MARK = {
  alabama:'A', georgia:'G', ohiostate:'O', michigan:'M', oregon:'O',
  texas:'T', texasam:'A&M', oklahoma:'OU', indiana:'IU', lsu:'LSU',
  notredame:'ND', miami:'U', florida:'F', tennessee:'T', clemson:'C',
  auburn:'AU', arkansas:'A', kentucky:'UK', missouri:'M', vanderbilt:'V',
  olemiss:'M', missstate:'M', southcarolina:'C', pennstate:'PS',
  michiganstate:'S', wisconsin:'W', iowa:'I', nebraska:'N', minnesota:'M',
  illinois:'I', maryland:'M', northwestern:'N', purdue:'P', rutgers:'R',
  ucla:'UCLA', usc:'SC', washington:'W', arizona:'A', arizonastate:'ASU',
  baylor:'BU', byu:'Y', cincinnati:'C', colorado:'CU', houston:'UH',
  iowastate:'ISU', kansas:'KU', kansasstate:'K', oklahomastate:'OSU',
  tcu:'TCU', texastech:'TT', ucf:'UCF', utah:'U', westvirginia:'WV',
  bostoncollege:'BC', california:'CAL', duke:'D', floridastate:'FSU',
  georgiatech:'GT', louisville:'L', ncstate:'S', northcarolina:'NC',
  pittsburgh:'P', smu:'SMU', stanford:'S', syracuse:'S', virginia:'V',
  virginiatech:'VT', wakeforest:'WF', oregonstate:'OS', washingtonstate:'WS',
  uconn:'C', army:'A', navy:'N', charlotte:'C', eastcarolina:'ECU',
  fau:'FAU', memphis:'M', northtexas:'NT', rice:'R', southflorida:'USF',
  temple:'T', tulane:'T', tulsa:'TU', uab:'UAB', utsa:'UTSA',
  delaware:'D', fiu:'FIU', jacksonvillestate:'JSU', kennesawstate:'KSU',
  liberty:'L', louisianatech:'LA', middletennessee:'MT', missouristate:'MS',
  newmexicostate:'NM', samhouston:'SH', westernkentucky:'WKU',
  akron:'A', ballstate:'BS', bowlinggreen:'BG', buffalo:'UB',
  centralmichigan:'CM', easternmichigan:'EMU', kentstate:'K', miamioh:'M',
  ohio:'O', toledo:'T', umass:'UM', westernmichigan:'W',
  airforce:'AF', boisestate:'B', coloradostate:'CSU', fresnostate:'F',
  hawaii:'H', nevada:'N', newmexico:'NM', northernillinois:'NIU',
  sandiegostate:'SD', sanjosestate:'SJ', unlv:'UNLV', utahstate:'USU',
  utep:'UTEP', wyoming:'W',
  appstate:'APP', arkansasstate:'A', coastalcarolina:'CCU',
  georgiasouthern:'GS', georgiastate:'GS', jamesmadison:'JMU',
  louisiana:'UL', ulmonroe:'ULM', marshall:'M', olddominion:'ODU',
  southalabama:'S', southernmiss:'M', texasstate:'TXST', troy:'T'
};

/** Parsed master list. */
const TEAMS = TEAM_RAW.trim().split('\n')
  .map(l => l.trim())
  .filter(Boolean)
  .map(line => {
    const [id, school, mascot, abbr, conf, primary, secondary] = line.split('|');
    return { id, school, mascot, abbr, conf, primary, secondary,
             mark: TEAM_MARK[id] || initials(school) };
  });

/** Fallback monogram: first letter of each real word in the school name.
    Deliberately not the abbreviation — the plate already carries that on
    the black panel, and printing it twice looks like a mistake. */
function initials(school) {
  const skip = new Set(['of', 'the', 'at', 'and']);
  const words = String(school).replace(/[().]/g, ' ').split(/\s+/)
    .filter(w => w && !skip.has(w.toLowerCase()));
  if (words.length === 1) {
    const w = words[0];
    return /^[A-Z0-9&]{2,5}$/.test(w) ? w : w[0].toUpperCase();
  }
  return words.slice(0, 3).map(w => w[0].toUpperCase()).join('');
}

const TEAM_BY_ID = Object.fromEntries(TEAMS.map(t => [t.id, t]));

const CONFERENCES = [...new Set(TEAMS.map(t => t.conf))];

/* ---- Custom / dynasty teams (relocations, created schools) --------------
   Anything the commissioner adds in the app is stored here at runtime and
   persisted to localStorage under 'cfp27.customTeams'.                    */
function loadCustomTeams() {
  try {
    const raw = localStorage.getItem('cfp27.customTeams');
    if (!raw) return;
    JSON.parse(raw).forEach(t => {
      TEAM_BY_ID[t.id] = t;
      if (!TEAMS.some(x => x.id === t.id)) TEAMS.push(t);
    });
  } catch (e) { /* ignore corrupt storage */ }
}

function saveCustomTeams() {
  const custom = TEAMS.filter(t => t.custom);
  localStorage.setItem('cfp27.customTeams', JSON.stringify(custom));
}

/* ---- Per-team overrides (colors / abbr / logo) the commish has edited -- */
function loadOverrides() {
  try { return JSON.parse(localStorage.getItem('cfp27.overrides') || '{}'); }
  catch (e) { return {}; }
}
function saveOverrides(o) {
  localStorage.setItem('cfp27.overrides', JSON.stringify(o));
}

loadCustomTeams();
