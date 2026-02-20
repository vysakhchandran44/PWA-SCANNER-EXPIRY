/**
 * Expiry Tracker - Master Product Database
 * 91 products with GTIN → RMS mapping
 * Auto-loads on first app start
 */

const PRELOADED_MASTER_DATA = [
  {
    "barcode": "00300020105557",
    "name": "TELFAST 180MG TABLETS 15S",
    "rms": "220002473"
  },
  {
    "barcode": "00300020122554",
    "name": "TANDO 20 MG TAB 4S",
    "rms": "220196935"
  },
  {
    "barcode": "00840149658430",
    "name": "VIAGRA 100MG 4S",
    "rms": "220153086"
  },
  {
    "barcode": "00840149658447",
    "name": "VIAGRA 50MG TABLETS 4S",
    "rms": "220169892"
  },
  {
    "barcode": "00840164519136",
    "name": "CERAZETTE TABLETS 28S",
    "rms": "220171638"
  },
  {
    "barcode": "00840164520125",
    "name": "MARVELON TABLETS 21S",
    "rms": "220160424"
  },
  {
    "barcode": "03499320010863",
    "name": "FUCIDIN CREAM 15GM",
    "rms": "220226723"
  },
  {
    "barcode": "03574661047492",
    "name": "Regaine 5% 60ml HDPE Bottle",
    "rms": "220218218"
  },
  {
    "barcode": "03574661089751",
    "name": "Imodium INSTANTS 12s",
    "rms": "220153581"
  },
  {
    "barcode": "03582910076384",
    "name": "CRESTOR 5MG TAB OF 28",
    "rms": "220230950"
  },
  {
    "barcode": "03664798001105",
    "name": "Maalox stomach pain 20s",
    "rms": "220230060"
  },
  {
    "barcode": "03664798027204",
    "name": "Buscopan 10mg 50s",
    "rms": "220181589"
  },
  {
    "barcode": "03664798031614",
    "name": "Mucoplexil 0.33 mg / ml 150ml Glass Bottle",
    "rms": "220202355"
  },
  {
    "barcode": "03664798031966",
    "name": "Telfast 180mg 30s",
    "rms": "220172600"
  },
  {
    "barcode": "03664798031997",
    "name": "Telfast 180mg 15s",
    "rms": "220002473"
  },
  {
    "barcode": "04011548046777",
    "name": "Nizoral 2% Cream 30g Tube",
    "rms": "220164453"
  },
  {
    "barcode": "04015630066599",
    "name": "ENTEROGERMINA 2 BILLION 12 CAPSULES",
    "rms": "220202455"
  },
  {
    "barcode": "04015630068272",
    "name": "ACCUCHECK GUIDE STRIPS 50S",
    "rms": "220225199"
  },
  {
    "barcode": "04054839062964",
    "name": "QUESTD VITAMIN D",
    "rms": "220228887"
  },
  {
    "barcode": "04260161040192",
    "name": "HIRUDOID CR",
    "rms": "220229364"
  },
  {
    "barcode": "05000158065222",
    "name": "QUESTD VITAMIN D",
    "rms": "220230146"
  },
  {
    "barcode": "05000456034203",
    "name": "NOLVADEX 10MG TABLETS 30S",
    "rms": "220152890"
  },
  {
    "barcode": "05056227207734",
    "name": "LOCERYL 5 NAIL LACQUER",
    "rms": "220195550"
  },
  {
    "barcode": "05413868111620",
    "name": "PARIET 20MG TABLETS 14S",
    "rms": "220170973"
  },
  {
    "barcode": "05415062304280",
    "name": "Ponstan Forte 500mg 20s",
    "rms": "220171263"
  },
  {
    "barcode": "05415062307595",
    "name": "DIFLUCAN 150mg 1s Blister",
    "rms": "220161531"
  },
  {
    "barcode": "05415062310724",
    "name": "DIFLUCAN 50MG CAPS 7S",
    "rms": "220161317"
  },
  {
    "barcode": "06281086013960",
    "name": "SNAFI 5 MG TAB",
    "rms": "220193182"
  },
  {
    "barcode": "06281086341780",
    "name": "SNAFI TABLET 20MG 12S",
    "rms": "220169060"
  },
  {
    "barcode": "06285074002196",
    "name": "GYNERA TABLETS 21S",
    "rms": "220164755"
  },
  {
    "barcode": "06285074002417",
    "name": "DIANE 35 TABLETS 21S",
    "rms": "220169789"
  },
  {
    "barcode": "06285447000095",
    "name": "NOLVADEX 10MG TABLETS 30S",
    "rms": "220152890"
  },
  {
    "barcode": "06291100083367",
    "name": "MEBO",
    "rms": "220233098"
  },
  {
    "barcode": "06291100086306",
    "name": "MEBO BURN OINTMENT",
    "rms": "220171571"
  },
  {
    "barcode": "06291100087457",
    "name": "MEBO SCAR OINTMENT 50G",
    "rms": "220236371"
  },
  {
    "barcode": "06291107431055",
    "name": "ZENTEL 400mg 1s Blister",
    "rms": "220160600"
  },
  {
    "barcode": "06291109120018",
    "name": "Panadol Sinus 24s",
    "rms": "220231943"
  },
  {
    "barcode": "06291109120100",
    "name": "Panadol Baby & Infant 100ml Bottle",
    "rms": "220219715"
  },
  {
    "barcode": "06291109120209",
    "name": "Panadol Cold & Flu All In one 24s",
    "rms": "220223268"
  },
  {
    "barcode": "06291109120216",
    "name": "Panadol Cold & Flu Day 24s",
    "rms": "220236252"
  },
  {
    "barcode": "06291109120469",
    "name": "Panadol Advance 24s",
    "rms": "220236078"
  },
  {
    "barcode": "06291109120476",
    "name": "Panadol Advance 48s",
    "rms": "220222187"
  },
  {
    "barcode": "06291109121893",
    "name": "Panadol Extra WITH OPTIZORB 24s",
    "rms": "220229947"
  },
  {
    "barcode": "06291109121909",
    "name": "Panadol Extra WITH OPTIZORB 48s",
    "rms": "220226309"
  },
  {
    "barcode": "06295120051177",
    "name": "Gaviscon Advance PEPPERMINT",
    "rms": "220171299"
  },
  {
    "barcode": "06297001031278",
    "name": "QUESTD VITAMIN D3 5000 IU TABLET 60S",
    "rms": "220235239"
  },
  {
    "barcode": "06297001031292",
    "name": "TELFAST 180MG TABLETS 15S",
    "rms": "220002473"
  },
  {
    "barcode": "07612797486085",
    "name": "Cataflam 50mg 10s Blister",
    "rms": "220162683"
  },
  {
    "barcode": "07612797507759",
    "name": "TobraDex Eye Ointment 3.5g Tube",
    "rms": "220223627"
  },
  {
    "barcode": "07612797507827",
    "name": "TobraDex Eye Drop Suspension 5ml Dropper Bottle",
    "rms": "220228055"
  },
  {
    "barcode": "07613421050054",
    "name": "ECINQ FILM COATED ULIPRISTAL ACETATE",
    "rms": "220171489"
  },
  {
    "barcode": "07640153081971",
    "name": "DEXILANT 60MG 14TA",
    "rms": "220156050"
  },
  {
    "barcode": "07640153081995",
    "name": "DEXILANT 60MG 14TA",
    "rms": "220156050"
  },
  {
    "barcode": "07640153082008",
    "name": "DEXILANT 60MG 28TAB",
    "rms": "220163583"
  },
  {
    "barcode": "08002660030955",
    "name": "EMLA 5 CREAM 5G",
    "rms": "220152551"
  },
  {
    "barcode": "08002660033710",
    "name": "Brufen Paediatric Syrup 100mg/5ml 200ml Plastic Bottle",
    "rms": "220201540"
  },
  {
    "barcode": "08020030000063",
    "name": "SILER SILDENAFIL 100 4FILMS",
    "rms": "220180316"
  },
  {
    "barcode": "08033661801015",
    "name": "QUESTD VITAMIN D",
    "rms": "220171794"
  },
  {
    "barcode": "08433042009731",
    "name": "BENZAC AC 25 GEL 60GM",
    "rms": "220226723"
  },
  {
    "barcode": "15285003470551",
    "name": "LOMEXIN 1000 OVULE 1S",
    "rms": "220152778"
  },
  {
    "barcode": "00000001007721",
    "name": "NISITA SPRAY",
    "rms": ""
  },
  {
    "barcode": "00300650287029",
    "name": "NAPHCON-A Sterile Ophthalmic 15 ml Drop-Tainer",
    "rms": ""
  },
  {
    "barcode": "04008500024362",
    "name": "QUESTD VITAMIN D",
    "rms": ""
  },
  {
    "barcode": "04008500024447",
    "name": "Rennie PEPPERMINT 96s",
    "rms": ""
  },
  {
    "barcode": "04011548030158",
    "name": "Nizoral shampoo 100ml Plastic Bottle",
    "rms": ""
  },
  {
    "barcode": "04011548031735",
    "name": "Orofar 30ml Bottle",
    "rms": ""
  },
  {
    "barcode": "04031626710963",
    "name": "POSIFORMIN",
    "rms": ""
  },
  {
    "barcode": "04260095687821",
    "name": "Locoid Cream 30g Tube",
    "rms": ""
  },
  {
    "barcode": "05702191018226",
    "name": "Fucidin 2% Cream 15g Collapsible Tube",
    "rms": ""
  },
  {
    "barcode": "06091403220809",
    "name": "Xylocaine 10% 50ml Bottle with Spray Pump",
    "rms": ""
  },
  {
    "barcode": "06091403221165",
    "name": "EMLA",
    "rms": ""
  },
  {
    "barcode": "06285074002257",
    "name": "YAZ 28s Blister",
    "rms": ""
  },
  {
    "barcode": "06285074002448",
    "name": "Yasmin 21s Blister",
    "rms": ""
  },
  {
    "barcode": "06285074003421",
    "name": "Claritine 10mg 30s",
    "rms": ""
  },
  {
    "barcode": "06285095000089",
    "name": "SALINOSE BABY",
    "rms": ""
  },
  {
    "barcode": "06285095000096",
    "name": "SALINOSE ADULT",
    "rms": ""
  },
  {
    "barcode": "06285128004565",
    "name": "QUESTD VITAMIN D",
    "rms": ""
  },
  {
    "barcode": "06285128014113",
    "name": "QUESTD VITAMIN D",
    "rms": ""
  },
  {
    "barcode": "06291107361130",
    "name": "QUESTD VITAMIN D",
    "rms": ""
  },
  {
    "barcode": "06291107439358",
    "name": "Zyrtec 75ml Bottle",
    "rms": ""
  },
  {
    "barcode": "06291109120179",
    "name": "Otrivin MENTHOL 10ml Metered-Dose-Spray Bottle",
    "rms": ""
  },
  {
    "barcode": "06291109120223",
    "name": "Panadol COLD & FLU VAPOUR RELEASE + DECONGESTANT 10 Sachets",
    "rms": ""
  },
  {
    "barcode": "06291109120544",
    "name": "Otrivin 0.05% 10 ml Metered-Dose Spray Bottle",
    "rms": ""
  },
  {
    "barcode": "06291109120568",
    "name": "Otrivin 0.1% 10ml Metered Dose Spray Bottle",
    "rms": ""
  },
  {
    "barcode": "06291109120681",
    "name": "Panadol Children's 5-12 years 100ml Glass Bottle",
    "rms": ""
  },
  {
    "barcode": "06295120041390",
    "name": "QUESTD VITAMIN D",
    "rms": ""
  },
  {
    "barcode": "06297000760254",
    "name": "ECINQ FILM COATED ULIPRISTAL ACETATE",
    "rms": ""
  },
  {
    "barcode": "07321839710995",
    "name": "RHINOCORT AQUA 64MCG 120S",
    "rms": ""
  },
  {
    "barcode": "08033011160106",
    "name": "DIANE 35 TAB",
    "rms": ""
  },
  {
    "barcode": "14987028633416",
    "name": "MYONAL",
    "rms": ""
  },
  {
    "barcode": "18033661806222",
    "name": "HYLOFID GEL",
    "rms": ""
  }
];

// Auto-load master data on startup
async function loadPreloadedMasterData() {
  try {
    const master = await DB.getAllMaster();
    
    if (master.length === 0 && PRELOADED_MASTER_DATA.length > 0) {
      console.log('Loading preloaded master data...');
      await DB.bulkAddMaster(PRELOADED_MASTER_DATA);
      await refreshMasterCount();
      console.log('Loaded', PRELOADED_MASTER_DATA.length, 'products');
    }
  } catch (err) {
    console.error('Failed to load preloaded data:', err);
  }
}

// Call after DB init
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(loadPreloadedMasterData, 1000);
  });
}
