/* ============================================================
   TEAM DATABASE  —  FBS alignment used by CFB 26/27
   Format:  id | School | Mascot | ABBR | Conference | primary | secondary
   Colors are editable in the app (gear icon on any seeded team).
   ============================================================ */

const TEAM_RAW = `
alabama|Alabama|Crimson Tide|ALA|SEC|#9E1B32|#FFFFFF
arkansas|Arkansas|Razorbacks|ARK|SEC|#9D2235|#FFFFFF
auburn|Auburn|Tigers|AUB|SEC|#0C2340|#E87722
florida|Florida|Gators|UF|SEC|#0021A5|#FA4616
georgia|Georgia|Bulldogs|UGA|SEC|#BA0C2F|#000000
kentucky|Kentucky|Wildcats|UK|SEC|#0033A0|#FFFFFF
lsu|LSU|Tigers|LSU|SEC|#461D7C|#FDD023
olemiss|Ole Miss|Rebels|MISS|SEC|#14213D|#CE1126
missstate|Mississippi State|Bulldogs|MSST|SEC|#660000|#FFFFFF
missouri|Missouri|Tigers|MIZ|SEC|#F1B82D|#000000
oklahoma|Oklahoma|Sooners|OU|SEC|#841617|#FDF9F7
southcarolina|South Carolina|Gamecocks|SC|SEC|#73000A|#000000
tennessee|Tennessee|Volunteers|TENN|SEC|#FF8200|#FFFFFF
texas|Texas|Longhorns|TEX|SEC|#BF5700|#FFFFFF
texasam|Texas A&M|Aggies|A&M|SEC|#500000|#FFFFFF
vanderbilt|Vanderbilt|Commodores|VANDY|SEC|#866D4B|#000000

illinois|Illinois|Fighting Illini|ILL|Big Ten|#13294B|#E84A27
indiana|Indiana|Hoosiers|IND|Big Ten|#990000|#FFFFFF
iowa|Iowa|Hawkeyes|IOWA|Big Ten|#000000|#FFCD00
maryland|Maryland|Terrapins|MD|Big Ten|#E03A3E|#FFD520
michigan|Michigan|Wolverines|MICH|Big Ten|#00274C|#FFCB05
michiganstate|Michigan State|Spartans|MSU|Big Ten|#18453B|#FFFFFF
minnesota|Minnesota|Golden Gophers|MINN|Big Ten|#7A0019|#FFCC33
nebraska|Nebraska|Cornhuskers|NEB|Big Ten|#E41C38|#FFFFFF
northwestern|Northwestern|Wildcats|NU|Big Ten|#4E2A84|#FFFFFF
ohiostate|Ohio State|Buckeyes|OSU|Big Ten|#BB0000|#666666
oregon|Oregon|Ducks|ORE|Big Ten|#154733|#FEE123
pennstate|Penn State|Nittany Lions|PSU|Big Ten|#041E42|#FFFFFF
purdue|Purdue|Boilermakers|PUR|Big Ten|#CEB888|#000000
rutgers|Rutgers|Scarlet Knights|RUT|Big Ten|#CC0033|#FFFFFF
ucla|UCLA|Bruins|UCLA|Big Ten|#2D68C4|#F2A900
usc|USC|Trojans|USC|Big Ten|#990000|#FFC72C
washington|Washington|Huskies|UW|Big Ten|#4B2E83|#B7A57A
wisconsin|Wisconsin|Badgers|WIS|Big Ten|#C5050C|#FFFFFF

arizona|Arizona|Wildcats|ARIZ|Big 12|#003366|#CC0033
arizonastate|Arizona State|Sun Devils|ASU|Big 12|#8C1D40|#FFC627
baylor|Baylor|Bears|BAY|Big 12|#154734|#FFB81C
byu|BYU|Cougars|BYU|Big 12|#002E5D|#FFFFFF
cincinnati|Cincinnati|Bearcats|CIN|Big 12|#E00122|#000000
colorado|Colorado|Buffaloes|COLO|Big 12|#CFB87C|#000000
houston|Houston|Cougars|HOU|Big 12|#C8102E|#FFFFFF
iowastate|Iowa State|Cyclones|ISU|Big 12|#C8102E|#F1BE48
kansas|Kansas|Jayhawks|KU|Big 12|#0051BA|#E8000D
kansasstate|Kansas State|Wildcats|KSU|Big 12|#512888|#FFFFFF
oklahomastate|Oklahoma State|Cowboys|OKST|Big 12|#FF7300|#000000
tcu|TCU|Horned Frogs|TCU|Big 12|#4D1979|#FFFFFF
texastech|Texas Tech|Red Raiders|TTU|Big 12|#CC0000|#000000
ucf|UCF|Knights|UCF|Big 12|#000000|#BA9B37
utah|Utah|Utes|UTAH|Big 12|#CC0000|#FFFFFF
westvirginia|West Virginia|Mountaineers|WVU|Big 12|#002855|#EAAA00

bostoncollege|Boston College|Eagles|BC|ACC|#98002E|#BC9B6A
california|California|Golden Bears|CAL|ACC|#003262|#FDB515
clemson|Clemson|Tigers|CLEM|ACC|#F66733|#522D80
duke|Duke|Blue Devils|DUKE|ACC|#003087|#FFFFFF
floridastate|Florida State|Seminoles|FSU|ACC|#782F40|#CEB888
georgiatech|Georgia Tech|Yellow Jackets|GT|ACC|#B3A369|#003057
louisville|Louisville|Cardinals|LOU|ACC|#AD0000|#000000
miami|Miami|Hurricanes|MIA|ACC|#F47321|#005030
ncstate|NC State|Wolfpack|NCST|ACC|#CC0000|#000000
northcarolina|North Carolina|Tar Heels|UNC|ACC|#4B9CD3|#FFFFFF
pittsburgh|Pittsburgh|Panthers|PITT|ACC|#003594|#FFB81C
smu|SMU|Mustangs|SMU|ACC|#354CA1|#C8102E
stanford|Stanford|Cardinal|STAN|ACC|#8C1515|#FFFFFF
syracuse|Syracuse|Orange|SYR|ACC|#F76900|#000E54
virginia|Virginia|Cavaliers|UVA|ACC|#232D4B|#F84C1E
virginiatech|Virginia Tech|Hokies|VT|ACC|#630031|#CF4420
wakeforest|Wake Forest|Demon Deacons|WAKE|ACC|#9E7E38|#000000

oregonstate|Oregon State|Beavers|ORST|Pac-12|#DC4405|#000000
washingtonstate|Washington State|Cougars|WSU|Pac-12|#981E32|#5E6A71

notredame|Notre Dame|Fighting Irish|ND|Independent|#0C2340|#C99700
uconn|UConn|Huskies|CONN|Independent|#000E2F|#FFFFFF

army|Army|Black Knights|ARMY|American|#000000|#D4BF91
charlotte|Charlotte|49ers|CLT|American|#046A38|#B9975B
eastcarolina|East Carolina|Pirates|ECU|American|#592A8A|#FDC82F
fau|Florida Atlantic|Owls|FAU|American|#003366|#CC0000
memphis|Memphis|Tigers|MEM|American|#003087|#898D8D
navy|Navy|Midshipmen|NAVY|American|#00205B|#C5B783
northtexas|North Texas|Mean Green|UNT|American|#00853E|#FFFFFF
rice|Rice|Owls|RICE|American|#00205B|#FFFFFF
southflorida|South Florida|Bulls|USF|American|#006747|#CFC493
temple|Temple|Owls|TEM|American|#9D2235|#FFFFFF
tulane|Tulane|Green Wave|TULN|American|#006747|#418FDE
tulsa|Tulsa|Golden Hurricane|TLSA|American|#002D72|#C8102E
uab|UAB|Blazers|UAB|American|#1E6B52|#F4C300
utsa|UTSA|Roadrunners|UTSA|American|#0C2340|#F15A22

delaware|Delaware|Blue Hens|DEL|C-USA|#00539F|#FFD200
fiu|Florida International|Panthers|FIU|C-USA|#081E3F|#B6862C
jacksonvillestate|Jacksonville State|Gamecocks|JVST|C-USA|#CC0000|#FFFFFF
kennesawstate|Kennesaw State|Owls|KENN|C-USA|#FFC629|#000000
liberty|Liberty|Flames|LIB|C-USA|#002D62|#A6192E
louisianatech|Louisiana Tech|Bulldogs|LT|C-USA|#002F8B|#E31B23
middletennessee|Middle Tennessee|Blue Raiders|MTSU|C-USA|#0066CC|#FFFFFF
missouristate|Missouri State|Bears|MOST|C-USA|#5E0009|#FFFFFF
newmexicostate|New Mexico State|Aggies|NMSU|C-USA|#8C0B42|#FFFFFF
samhouston|Sam Houston|Bearkats|SHSU|C-USA|#F26522|#FFFFFF
utep|UTEP|Miners|UTEP|C-USA|#FF8200|#041E42
westernkentucky|Western Kentucky|Hilltoppers|WKU|C-USA|#B01E24|#FFFFFF

akron|Akron|Zips|AKR|MAC|#041E42|#A89968
ballstate|Ball State|Cardinals|BALL|MAC|#BA0C2F|#FFFFFF
bowlinggreen|Bowling Green|Falcons|BGSU|MAC|#FE5000|#4F2C1D
buffalo|Buffalo|Bulls|BUFF|MAC|#005BBB|#FFFFFF
centralmichigan|Central Michigan|Chippewas|CMU|MAC|#6A0032|#FFC82E
easternmichigan|Eastern Michigan|Eagles|EMU|MAC|#046A38|#FFFFFF
kentstate|Kent State|Golden Flashes|KENT|MAC|#002664|#EAAB00
miamioh|Miami (OH)|RedHawks|M-OH|MAC|#C41230|#FFFFFF
northernillinois|Northern Illinois|Huskies|NIU|MAC|#C8102E|#000000
ohio|Ohio|Bobcats|OHIO|MAC|#00694E|#CDA077
toledo|Toledo|Rockets|TOL|MAC|#15397F|#FFB700
umass|UMass|Minutemen|UMASS|MAC|#881C1C|#FFFFFF
westernmichigan|Western Michigan|Broncos|WMU|MAC|#6C4023|#B5A167

airforce|Air Force|Falcons|AF|Mountain West|#004A7B|#B0B7BC
boisestate|Boise State|Broncos|BSU|Mountain West|#0033A0|#D64309
coloradostate|Colorado State|Rams|CSU|Mountain West|#1E4D2B|#C8C372
fresnostate|Fresno State|Bulldogs|FRES|Mountain West|#DB0032|#002E6D
hawaii|Hawaii|Rainbow Warriors|HAW|Mountain West|#024731|#FFFFFF
nevada|Nevada|Wolf Pack|NEV|Mountain West|#003366|#807F84
newmexico|New Mexico|Lobos|UNM|Mountain West|#BA0C2F|#63666A
sandiegostate|San Diego State|Aztecs|SDSU|Mountain West|#A6192E|#000000
sanjosestate|San Jose State|Spartans|SJSU|Mountain West|#0055A2|#E5A823
unlv|UNLV|Rebels|UNLV|Mountain West|#CF0A2C|#666666
utahstate|Utah State|Aggies|USU|Mountain West|#00263A|#FFFFFF
wyoming|Wyoming|Cowboys|WYO|Mountain West|#492F24|#FFC425

appstate|Appalachian State|Mountaineers|APP|Sun Belt|#000000|#FFCC00
arkansasstate|Arkansas State|Red Wolves|ARST|Sun Belt|#CC092F|#000000
coastalcarolina|Coastal Carolina|Chanticleers|CCU|Sun Belt|#006F71|#A27752
georgiasouthern|Georgia Southern|Eagles|GASO|Sun Belt|#041E42|#A6A6A6
georgiastate|Georgia State|Panthers|GAST|Sun Belt|#0039A6|#FFFFFF
jamesmadison|James Madison|Dukes|JMU|Sun Belt|#450084|#CBB677
louisiana|Louisiana|Ragin' Cajuns|UL|Sun Belt|#CE181E|#FFFFFF
ulmonroe|UL Monroe|Warhawks|ULM|Sun Belt|#840029|#CDB87D
marshall|Marshall|Thundering Herd|MRSH|Sun Belt|#00B140|#FFFFFF
olddominion|Old Dominion|Monarchs|ODU|Sun Belt|#003087|#A1D2F1
southalabama|South Alabama|Jaguars|USA|Sun Belt|#00205B|#BF0D3E
southernmiss|Southern Miss|Golden Eagles|USM|Sun Belt|#000000|#FFAF00
texasstate|Texas State|Bobcats|TXST|Sun Belt|#501214|#AE9142
troy|Troy|Trojans|TROY|Sun Belt|#8A2432|#FFFFFF
`;

/** Parsed master list. */
const TEAMS = TEAM_RAW.trim().split('\n')
  .map(l => l.trim())
  .filter(Boolean)
  .map(line => {
    const [id, school, mascot, abbr, conf, primary, secondary] = line.split('|');
    return { id, school, mascot, abbr, conf, primary, secondary };
  });

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
