const mongoose = require('mongoose');
const DropdownList = require('../models/DropdownList');
const User = require('../models/User');
require('dotenv').config();

// قائمة التشخيصات
const diagnoses = [
  "Abdominal Hernia", "Abdominal Swelling", "Abnormalities", "Abortion", "Abscess",
  "Actinobacillus pleuropneumoniae(APP)", "Actinomycosis", "Acute,Chronic Mastitis",
  "Amputation of (hind,or fore leg)", "Anorexia", "Anuria(inflamation of urithera)",
  "Arthritis", "atrasia anai", "Bleeding", "Blindness", "Bloat", "Blood Parasites",
  "Blood Sample", "Blurred eye", "Bottle jaw", "Bronchitis", "Camel pox", "CamelPox",
  "Carcinoma", "Caseous lymphadenitis", "Castration", "Cervix Ulcer", "Cesarian ,dyatokia",
  "Chlamydiosis", "Coccidiosis", "Colic", "congenital defect",
  "Contagious pustular dermatitis,Soremouth", "Corneal Opacity", "Cowpox", "Cupper Diff",
  "Cystitis", "Dawrfism", "Dehorning", "Diarrhea", "Downer Casses", "Dystocia",
  "Endometritis", "Enterotoxemia", "Entritis", "Enucleation of eye tumour", "Epistaxis",
  "External Parasites", "Fetlook joint deformility", "Fibroma", "Fibrosed Tissues",
  "fighting affection,ruminal stasis", "Fistula", "Follow Up", "food toxicity",
  "Foot Scald / Footrot", "Forign Body", "Fracture at Fore Limb", "Fracture at Hind Limb",
  "Fractures", "Fungal infection", "Gangrenous Mastitis (Mastoectomy)", "Gingivitis",
  "Glositis", "Hematoma", "HERPES VIRUS", "Hoof cutting", "Hoof Inflammation",
  "Horn fractures", "Hypocalcemia", "Hypothermia", "Hypovitaminosis", "inactive ovaries",
  "Infertility", "inflamation of Gulla", "Inflammed Clows", "Inflammed Penis",
  "Inguinal Hernia", "Internal parasites", "interrupted eye lid", "intersuseption (intestinal torsion)",
  "Lack of milk production", "Lamness", "leg odema", "Listeriosis", "Long hoof",
  "Lymphadenitis", "Malnutrition", "Mange", "Mastectomy", "Maxila And Mandible Swelling",
  "maxila and mandible swelling", "Metritis", "milk fever", "Mouth Ulceration",
  "Musculoskeltor", "Mycoplasma", "Mycotoxins", "Navel sterlization", "Nerve Injury",
  "No Diseases", "Obesity", "odema", "Oesophagitis", "Opthalmia", "Oral deep fungul",
  "Orchitis", "Orf virus", "Otitis", "Ovarian Cyst", "P.M(Post Mortum)", "paraphemosis",
  "Paresis", "Pasteurellosis", "Penis Inflammation", "Pharyngitis", "physiological odematous mastitis",
  "Pnemonia", "Polioencephalomacia", "Poor Immunity", "Pregnancy Toxemia  (ketosis)",
  "Prepuce Affections", "preputial ulcer", "Pyometra", "Q fever (Coxiella burnettii)",
  "Rectal Prolapse", "Rectovaginal Rupture", "Retained placenta", "Rhinitis", "RingWorm",
  "Ruminal drinking", "Ruminal Stasis", "Ruminitis", "Septecemia", "Sever Impaction",
  "Sharp Teeth", "SheepBox", "Shipping Fever", "Simple Indigestion", "Skin Diseases",
  "Skin Sensitivity", "Sluffed Hoof", "star gazing", "Stomatitis", "Stress",
  "Submandebular Inflammation", "Surgical Wounds", "Susp. Brucellosis", "susp. FMD",
  "Susp. PPR", "Susp. Rhabies", "Susp.blood parasites", "Susp.Chronic Hepatitis",
  "Susp.Chronic Polynephritis", "Susp.ET", "Susp.HS", "Susp.Johne's disease",
  "Susp.kidney infection", "Susp.Listeriosis", "Susp.Organophosphorus Compound",
  "susp.paratuberclosis", "Susp.peritonitis", "Susp.Pink Eye", "Susp.Q-Fever",
  "susp.thiamine Deff.", "Susp.trypanosomiasis", "suspp. Theileriosis", "Sway Back Disease",
  "Tendonitis,Myositis", "Tetanus, or lockjaw", "Trauma", "Udder Ulcers", "Umblical Hernia",
  "unknown fever", "unripped abcess", "Urinary tract infection", "Urithritis",
  "Uterine Prolapse", "Vaginal Prolapse", "Vaginitis", "Vitamins,Mineral Diff",
  "Vulva Ulceration", "White Muscle Disease", "Wounds"
];

// قائمة الأدوية مع الجرعات
const medications = [
  { name: "ADEMIN", unit: "100 ML" },
  { name: "Aerofar Spray", unit: "200 ml" },
  { name: "Albendazol2.5%", unit: "500 ml" },
  { name: "ALBEVET 2.5%", unit: "1 L" },
  { name: "Alfastat Oral", unit: "2250ml" },
  { name: "ALQUIN 1.5 GM", unit: "1.5 GM" },
  { name: "Aminovet", unit: "100 ml" },
  { name: "Amoxy", unit: "100ml" },
  { name: "Anti Histamin inj", unit: "100 ML" },
  { name: "Aquin Plus 2.5 gm", unit: "2.5 gm" },
  { name: "Artizone-S", unit: "100 ml" },
  { name: "ASC Povidine Iodine 10", unit: "4 L" },
  { name: "ASIPYR - V 2.5GM", unit: "2.5 GM" },
  { name: "Atrojat", unit: "100 ml" },
  { name: "Avicort 100", unit: "100 ml" },
  { name: "Avicycline 300", unit: "100 ml" },
  { name: "Avimec Super-S", unit: "100 ML" },
  { name: "B-Complex", unit: "100 ml" },
  { name: "BIOCILLIN 150 LA INJ", unit: "100 ML" },
  { name: "BLOATDAD", unit: "100 ML" },
  { name: "BUTALEX JOZAL", unit: "40 ML" },
  { name: "Butex 50 ml", unit: "50 ml" },
  { name: "Ca-Aminoplex", unit: "100ml" },
  { name: "Calcimost", unit: "100ml" },
  { name: "CALCIUM BOROGLUCONATE", unit: "500 ML" },
  { name: "Catosal", unit: "100ml" },
  { name: "CCPP", unit: "100 ML" },
  { name: "CEFTIONEL INJ", unit: "100 ML" },
  { name: "Chlorazin 100", unit: "100 ml" },
  { name: "Clamoxyl", unit: "100 ml" },
  { name: "Combi-Kel 20+20", unit: "100 ml" },
  { name: "COREBRAL", unit: "50 ML" },
  { name: "CuppriMax 2gm", unit: "2.1 gm" },
  { name: "Cymelarsan", unit: "20 ml" },
  { name: "Cyper Dib 100 EC 1L", unit: "1 litre" },
  { name: "Dectomax", unit: "50ml" },
  { name: "DERMA POUR 0.5%", unit: "500 ML" },
  { name: "Dexa kell 2%", unit: "50 ML" },
  { name: "dexavito 2%", unit: "100 ML" },
  { name: "DEXSTROSE 5%", unit: "500 ML" },
  { name: "Diazitrim fort oral", unit: "750 ML" },
  { name: "Doxysav 20%", unit: "500 GM" },
  { name: "Draxxin", unit: "50 ml" },
  { name: "Enrosave 5%", unit: "100 ml" },
  { name: "Eprecis", unit: "100 ml" },
  { name: "Estradiol", unit: "10ml" },
  { name: "ET", unit: "100ML" },
  { name: "Eye-Wash Spray", unit: "60 ml" },
  { name: "FACELPART", unit: "100 ML" },
  { name: "Flunixin 50 ml", unit: "50 ml" },
  { name: "FLUNXIN", unit: "100 ML" },
  { name: "FMD3", unit: "100ML" },
  { name: "FMD5", unit: "50ML" },
  { name: "Forcyl", unit: "100 ml" },
  { name: "Fruzoyl", unit: "100 ml" },
  { name: "FUROSEMIDE 5% INJ", unit: "50 ML" },
  { name: "Furosix 50", unit: "50 ml" },
  { name: "Gentodad 10%", unit: "100 ml" },
  { name: "Gestar 10ml", unit: "10 ml" },
  { name: "Glaycol M", unit: "1 litre" },
  { name: "HS", unit: "100ml" },
  { name: "HS PLUS ET", unit: "100ML" },
  { name: "IMIZOL JOZAL", unit: "100 ML" },
  { name: "Injetiophos inj", unit: "100 ml" },
  { name: "Interflor INJ", unit: "100 ML" },
  { name: "INTERFLOX", unit: "100 ML" },
  { name: "Introvet ES oral 1L", unit: "1 litre" },
  { name: "introvet WS 1KG", unit: "1 kg" },
  { name: "Iodi Jat 500ml", unit: "500 ml" },
  { name: "Iodine Oint 10%", unit: "200 gm" },
  { name: "Isopropyle Alcohole 70% 5L", unit: "5 L" },
  { name: "ivomec Super", unit: "50 ml" },
  { name: "Ketovet", unit: "100 ml" },
  { name: "laxavet", unit: "101 gm" },
  { name: "LIDOCINE 2%", unit: "50ML" },
  { name: "MACROLAN 200 INJ", unit: "100 ML" },
  { name: "Meloxicam", unit: "50 ml" },
  { name: "METALGEN", unit: "100 ML" },
  { name: "Multivitamin", unit: "50 ML" },
  { name: "Multivitamin 100ml", unit: "100 ml" },
  { name: "Mustijet Fort", unit: "10 gm" },
  { name: "Mustikell i.m.", unit: "Paste 10 ML" },
  { name: "No Treatment", unit: "No" },
  { name: "NORMAL SALINE", unit: "500 ML" },
  { name: "Norocillin 100", unit: "100 ml" },
  { name: "Nuflor", unit: "50 ml" },
  { name: "O.S.T FORT", unit: "10 ML" },
  { name: "Orgaboost Plus 30ml", unit: "30 ml" },
  { name: "Oxysav 5%", unit: "100 ML" },
  { name: "PARAZINTEL PLUS DOGS", unit: "1 TAB" },
  { name: "PEN & STREP", unit: "100 ML" },
  { name: "Peni-Kell", unit: "100 ml" },
  { name: "Pet-AMOX-PLUS", unit: "20 ML" },
  { name: "PHARMA DI-CURE", unit: "200 ML" },
  { name: "Pharmacin 100", unit: "100 ml" },
  { name: "Povidine Iodin", unit: "1 L" },
  { name: "POVIDON IODIN 10%", unit: "240 ML" },
  { name: "PPR", unit: "100 DOSES" },
  { name: "PRAZINTEL CATS", unit: "1 TAB" },
  { name: "Prostal", unit: "20 ML" },
  { name: "Receptal", unit: "10 ml" },
  { name: "Renger Lactate", unit: "500 ML" },
  { name: "Sodium Bicarbonate 8.4% 50ml", unit: "50 ml" },
  { name: "Spectosav", unit: "100 ML" },
  { name: "Spectovet", unit: "100 ML" },
  { name: "Sulpha Prime", unit: "100 ML" },
  { name: "Sulphadimidin 20% wsp", unit: "500 GM" },
  { name: "Sulphadimidine 100% 500 gm", unit: "500 gm" },
  { name: "Sulpher Oint 10%", unit: "200 gm" },
  { name: "Sulprin Gel", unit: "200 gm" },
  { name: "Synulox 100", unit: "100 ml" },
  { name: "TECTIN", unit: "50 ML" },
  { name: "Tectin 100 ml", unit: "100 ml" },
  { name: "Terra-Blue", unit: "100 gm" },
  { name: "terramycin spray", unit: "100 ml" },
  { name: "UDDER HEAL", unit: "100 GM" },
  { name: "Uddercure Massage", unit: "200 gm" },
  { name: "Ultrapour F", unit: "500 ML" },
  { name: "VIME-Lyte IV 500l", unit: "500 ml" },
  { name: "Vit E&Selenium 50", unit: "50 ml" },
  { name: "Vitamin ADE 1L", unit: "1LITRE" },
  { name: "Vitamin C 100% 1kg", unit: "1 kg" },
  { name: "Vitamin K3 100 ml", unit: "100 ml" },
  { name: "Vitol", unit: "1 L" },
  { name: "Vit-Oxy-F 100", unit: "100ml" },
  { name: "VMD VIME AMINOVIT", unit: "1 KG" },
  { name: "Voltavet(Diclofenac)50", unit: "50 ML" },
  { name: "Voltavet(Diclofenac)100", unit: "100 ml" },
  { name: "Wound Cure 100gm", unit: "100 gm" },
  { name: "Wound Jat 100gm", unit: "100 gm" },
  { name: "wound powder", unit: "100 gm" },
  { name: "Xyla", unit: "50 ml" },
  { name: "Xylased 2%", unit: "50ML" },
  { name: "Zinc oxide 10%", unit: "200 GM" },
  { name: "Zolite", unit: "500 ml" },
  { name: "Zuprevo", unit: "50 ml" }
];

async function seedDiagnosisAndMedications() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/artat-db');
    console.log('✅ Connected to MongoDB');

    // Find a user to use as createdBy (preferably super_admin)
    let systemUser = await User.findOne({ role: 'super_admin' });
    
    if (!systemUser) {
      // If no super admin, use any admin
      systemUser = await User.findOne({ role: 'admin' });
    }
    
    if (!systemUser) {
      // If still no user, use the first user found
      systemUser = await User.findOne();
    }

    if (!systemUser) {
      console.error('❌ No users found in database. Please create a user first.');
      process.exit(1);
    }

    console.log(`📝 Using user: ${systemUser.name} (${systemUser.email})`);

    // Seed Diagnoses
    console.log('\n🏥 Seeding diagnoses...');
    let diagnosisCount = 0;
    let diagnosisSkipped = 0;

    for (const diagnosis of diagnoses) {
      try {
        const existing = await DropdownList.findOne({
          category: 'diagnosis',
          value: diagnosis
        });

        if (!existing) {
          await DropdownList.create({
            category: 'diagnosis',
            value: diagnosis,
            label: diagnosis,
            labelAr: diagnosis, // يمكن إضافة ترجمة عربية لاحقاً
            isActive: true,
            createdBy: systemUser._id
          });
          diagnosisCount++;
          process.stdout.write(`✓`);
        } else {
          diagnosisSkipped++;
          process.stdout.write(`-`);
        }
      } catch (error) {
        console.error(`\n❌ Error seeding diagnosis "${diagnosis}":`, error.message);
      }
    }

    console.log(`\n✅ Diagnoses: ${diagnosisCount} added, ${diagnosisSkipped} skipped`);

    // Seed Medications
    console.log('\n💊 Seeding medications...');
    let medicationCount = 0;
    let medicationSkipped = 0;

    for (const medication of medications) {
      try {
        // دمج اسم الدواء مع الجرعة
        const medicationValue = `${medication.name} ${medication.unit}`;
        
        const existing = await DropdownList.findOne({
          category: 'medications',
          value: medicationValue
        });

        if (!existing) {
          await DropdownList.create({
            category: 'medications',
            value: medicationValue,
            label: medicationValue,
            labelAr: medicationValue, // يمكن إضافة ترجمة عربية لاحقاً
            isActive: true,
            createdBy: systemUser._id
          });
          medicationCount++;
          process.stdout.write(`✓`);
        } else {
          medicationSkipped++;
          process.stdout.write(`-`);
        }
      } catch (error) {
        console.error(`\n❌ Error seeding medication "${medication.name}":`, error.message);
      }
    }

    console.log(`\n✅ Medications: ${medicationCount} added, ${medicationSkipped} skipped`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY:');
    console.log(`   Diagnoses:   ${diagnosisCount} added, ${diagnosisSkipped} skipped`);
    console.log(`   Medications: ${medicationCount} added, ${medicationSkipped} skipped`);
    console.log(`   Total:       ${diagnosisCount + medicationCount} added, ${diagnosisSkipped + medicationSkipped} skipped`);
    console.log('='.repeat(60));

    console.log('\n✅ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding data:', error);
    process.exit(1);
  }
}

// Run the seeder
seedDiagnosisAndMedications();
