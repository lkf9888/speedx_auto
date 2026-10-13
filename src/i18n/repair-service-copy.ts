/**
 * Repair service guides (/auto-repair/<service>), written separately for each
 * language. Price rows are real estimate-assistant quotes from October 11–12,
 * 2026 (WorldPac list prices and labor-guide times); flat-price rows must match
 * FLAT_PRICES in src/lib/repair-chat/flat-price.ts.
 */
import type {
  LocalizedFaqItem,
  RepairPriceRow,
  RepairServiceCopy,
} from "@/i18n/types";
import type { RepairServiceSlug } from "@/lib/site-routes";

type ServiceLabels = Pick<
  RepairServiceCopy,
  | "symptomsTitle"
  | "inspectionsTitle"
  | "safetyTitle"
  | "processTitle"
  | "serviceAreaTitle"
  | "serviceAreaBody"
  | "faqTitle"
  | "ctaTitle"
  | "lastUpdated"
  | "pricingTitle"
  | "pricingColumns"
  | "pricingFootnote"
  | "relatedTitle"
>;

interface ServiceSeed {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  serviceType: string;
  summary: string;
  symptoms: string[];
  inspections: string[];
  safetyBody: string;
  process: string[];
  pricingBody: string;
  pricingRows: RepairPriceRow[];
  /** Overrides the shared footnote when the rows aren't estimate snapshots. */
  pricingFootnote?: string;
  faqs: LocalizedFaqItem[];
  ctaBody: string;
}

type ServiceSeeds = Record<RepairServiceSlug, ServiceSeed>;

function withLabels(
  labels: ServiceLabels,
  seeds: ServiceSeeds,
): Record<RepairServiceSlug, RepairServiceCopy> {
  return Object.fromEntries(
    Object.entries(seeds).map(([slug, seed]) => [slug, { ...labels, ...seed }]),
  ) as Record<RepairServiceSlug, RepairServiceCopy>;
}

// ------------------------------------------------------------------- English

const enLabels: ServiceLabels = {
  symptomsTitle: "When to book an inspection",
  inspectionsTitle: "What we inspect",
  safetyTitle: "Safety and diagnosis",
  processTitle: "What happens next",
  serviceAreaTitle: "Repair service area",
  serviceAreaBody:
    "SPEEDX AUTO repairs vehicles at 2980 Number 3 Road in Richmond near YVR, for drivers from Richmond, Vancouver, Burnaby, Delta, Surrey, and across Metro Vancouver. Appointments are required; the shop speaks English, Cantonese, and Mandarin.",
  faqTitle: "Frequently asked questions",
  ctaTitle: "Book this repair",
  lastUpdated: "Updated October 12, 2026",
  pricingTitle: "What it costs",
  pricingColumns: {
    job: "Job",
    laborTime: "Labor-guide time",
    total: "Total range",
    examples: "Examples",
  },
  pricingFootnote:
    "Totals are parts plus labor, before tax, from real quotes our estimate assistant produced on October 11–12, 2026 with WorldPac list prices and labor-guide times, widened by 10% each way like the estimate assistant's ranges. Your price depends on the exact vehicle and parts, and inspection may find other work. We confirm the quote before starting.",
  relatedTitle: "Other repair guides",
};

const enSeeds: ServiceSeeds = {
  maintenance: {
    metaTitle: "Oil Change & Car Maintenance in Richmond, BC",
    metaDescription:
      "Oil changes from $95 with oil and filter, tire changes, A/C recharge, belts, filters, and scheduled maintenance in Richmond near YVR. Labor by labor-guide times.",
    eyebrow: "Maintenance",
    title: "Oil Change and Scheduled Maintenance",
    serviceType: "Vehicle maintenance",
    summary:
      "SPEEDX AUTO handles oil changes, tire changes, A/C recharges, filters, belts, coolant, and scheduled maintenance at our Richmond shop near YVR. Oil changes start at $95 with oil and filter included. Other work is billed using industry-standard labor-guide times, with WorldPac parts at list price. Bring the mileage and any service history so we can recommend what is actually due.",
    symptoms: [
      "An oil change or a dashboard maintenance reminder is due",
      "Seasonal tire change, or tires that look worn or uneven",
      "A/C blowing warm, or a musty smell from the vents",
      "You bought a used vehicle and want a mechanical starting point",
    ],
    inspections: [
      "Fluid levels, fluid condition, and signs of leaks",
      "Tires, brakes, lights, wipers, belts, and filters",
      "Dashboard indicators and the maintenance due for your mileage",
    ],
    safetyBody:
      "Maintenance needs vary by vehicle, mileage, and how the car is used. We check first and explain what is due, and you choose what to authorize.",
    process: [
      "Send the vehicle, mileage, and the service you want",
      "Book a time with the Richmond shop",
      "Review what we find and approve only the work you choose",
    ],
    pricingBody:
      "Oil changes, tire changes, and A/C recharges are flat prices from the shop's price list. Everything else is billed by the labor-guide time, plus parts.",
    pricingRows: [
      {
        job: "Oil change, car or small SUV",
        laborTime: "Flat price",
        total: "$95 or $120",
        examples: "Regular 0W-20 $95 · Premium 0W-30 $120, oil and filter included",
      },
      {
        job: "Oil change, large SUV or pickup",
        laborTime: "Flat price",
        total: "$150 or $180",
        examples: "Regular 0W-20 $150 · Premium 0W-30 $180",
      },
      {
        job: "Tire change, per tire",
        laborTime: "Flat price",
        total: "$25–$45",
        examples: "Up to 18 in. $25 · over 18 in. $30 · run-flat $35 · AT/RT/MT $45; tires extra",
      },
      {
        job: "A/C refrigerant recharge",
        laborTime: "Flat price",
        total: "$150 or $230",
        examples: "R-134a (older systems) $150 · R-1234yf (newer systems) $230",
      },
      {
        job: "Cabin air filter",
        laborTime: "0.3 h",
        total: "$77–$95",
        examples: "2017 Honda CR-V: $77–$95",
      },
      {
        job: "Drive belt",
        laborTime: "0.4–0.6 h",
        total: "$88–$160",
        examples: "2015 Honda Accord: $88–$108 · 2018 Toyota Corolla: $101–$160",
      },
      {
        job: "Timing belt",
        laborTime: "3.5 h",
        total: "$519–$635",
        examples: "2012 Honda Odyssey: $519–$635",
      },
      {
        job: "Coolant drain and refill",
        laborTime: "1.2 h",
        total: "$130–$158 labor + coolant",
        examples: "2016 Toyota Highlander",
      },
    ],
    faqs: [
      {
        question: "How much is an oil change?",
        answer:
          "For a car or small SUV, $95 with regular 0W-20 or $120 with premium 0W-30, oil and filter included. A large SUV or pickup is $150 or $180, a European vehicle is $220 with OEM oil, and diesels are $280–$320. V8 engines are quoted by the team.",
      },
      {
        question: "How much is a tire change?",
        answer:
          "$25 per tire up to 18 inches, $30 over 18 inches, $35 for run-flats, and $45 for AT, RT, or MT tires. Buying the tires is extra.",
      },
      {
        question: "How much is an A/C recharge?",
        answer:
          "$150 for systems that use R-134a (mostly older vehicles) and $230 for R-1234yf (most newer vehicles). We confirm the refrigerant type from the label under the hood.",
      },
      {
        question: "Do you follow the same schedule for every vehicle?",
        answer: "No. What is due depends on the vehicle, mileage, how it is driven, and its service history.",
      },
      {
        question: "Can you inspect a used vehicle I just bought?",
        answer: "Yes. Send the vehicle details and what you want checked so we can book the right inspection.",
      },
      {
        question: "Will I get a quote before work starts?",
        answer: "Yes. We review the findings and the price with you, and you approve the work before we start.",
      },
    ],
    ctaBody: "Send the vehicle, mileage, and the service you need to book a time.",
  },
  brakes: {
    metaTitle: "Brake Repair in Richmond, BC: Pads, Rotors, Fluid",
    metaDescription:
      "Brake pads, rotors, calipers, and brake fluid in Richmond near YVR. Front pads on most 2015–2020 cars: $185–$444 including parts. Priced by labor-guide times.",
    eyebrow: "Brakes",
    title: "Brake Inspection and Repair",
    serviceType: "Brake repair",
    summary:
      "SPEEDX AUTO inspects and repairs brakes at our Richmond shop near YVR: pads, rotors, calipers, brake fluid, and warning lights. Front brake pads on most 2015–2020 cars cost $185–$444 including parts. Labor is billed using industry-standard labor-guide times. If braking feels unsafe or changes suddenly, stop driving when safe and arrange a tow.",
    symptoms: [
      "Squealing, grinding, or scraping when you brake",
      "Steering-wheel or pedal vibration while braking",
      "A soft, low, hard, or changing brake pedal",
      "Brake or ABS warning lights",
    ],
    inspections: [
      "Pad thickness, rotor condition, calipers, and hardware",
      "Brake fluid condition and visible leaks",
      "Warning lights and symptoms reproduced during a suitable check",
    ],
    safetyBody:
      "Brake problems affect control of the vehicle. Don't rely on a web page to decide whether it is safe to drive; arrange towing or roadside help when needed.",
    process: [
      "Describe the noise, pedal feel, warning lights, and when it happens",
      "Bring or tow the vehicle in for a brake inspection",
      "Review measurements, options, and the quote before approving work",
    ],
    pricingBody:
      "Brake labor is billed by the labor-guide time for your vehicle, plus parts at WorldPac list price. Most quotes show two or three pad or rotor options at different prices.",
    pricingRows: [
      {
        job: "Front brake pads",
        laborTime: "0.8–1.1 h",
        total: "$185–$444",
        examples: "2018 Toyota Corolla: $185–$227 · 2018 Honda Civic: $216–$311 · 2019 Toyota Camry: $262–$350",
      },
      {
        job: "Rear brake pads",
        laborTime: "0.9–1.1 h",
        total: "$204–$356",
        examples: "2019 Toyota Camry: $204–$290 · 2018 Mercedes-Benz C300: $292–$356",
      },
      {
        job: "Front brake rotors",
        laborTime: "0.7 h",
        total: "$329–$403",
        examples: "2020 Toyota RAV4 LE: $329–$403",
      },
      {
        job: "Rear brake rotors",
        laborTime: "0.8 h",
        total: "$398–$486",
        examples: "2020 Toyota RAV4 LE: $398–$486",
      },
      {
        job: "Brake fluid bleed",
        laborTime: "0.9 h",
        total: "$106–$215",
        examples: "2017 Honda CR-V: $106–$215",
      },
      {
        job: "Brake master cylinder",
        laborTime: "1.6 h",
        total: "$962–$1,176",
        examples: "2017 Honda CR-V: $962–$1,176",
      },
    ],
    faqs: [
      {
        question: "How much do front brake pads cost?",
        answer:
          "On most 2015–2020 cars, $185–$444 including parts and labor. For example, $185–$227 on a 2018 Toyota Corolla and $262–$350 on a 2019 Toyota Camry. The quote for your vehicle shows the exact pad options.",
      },
      {
        question: "Do I need new rotors every time I replace pads?",
        answer:
          "Not always. We measure the rotors and check for grooves or vibration, then tell you whether they can stay.",
      },
      {
        question: "Does brake noise always mean the pads are worn out?",
        answer: "No. Noise has several possible causes, so we inspect the brakes before choosing parts.",
      },
      {
        question: "Can I keep driving with a brake warning light?",
        answer:
          "The light needs checking. If braking changes or feels unsafe, stop when it is safe and arrange help.",
      },
      {
        question: "How is brake labor charged?",
        answer:
          "By the labor-guide time for your vehicle. Front pads on a 2019 Toyota Camry LE are rated at 1.1 hours.",
      },
      {
        question: "Do you quote brake work before replacing parts?",
        answer: "Yes. You see the findings, the parts options, and the total before approving any work.",
      },
    ],
    ctaBody: "Tell us the brake symptom, any warning lights, and the vehicle to book an inspection.",
  },
  diagnostics: {
    metaTitle: "Check Engine Light & Car Electrical Repair in Richmond",
    metaDescription:
      "Check-engine light, battery, alternator, starter, and sensor diagnosis in Richmond near YVR. Real price examples; Labor by labor-guide times.",
    eyebrow: "Diagnostics and electrical",
    title: "Check-Engine Light, Battery, and Electrical Diagnosis",
    serviceType: "Vehicle diagnostics",
    summary:
      "SPEEDX AUTO diagnoses check-engine lights, warning indicators, rough running, no-start problems, and battery or charging faults at our Richmond shop near YVR. A fault code points to a system, not automatically to a failed part, so we test before replacing anything. Repairs are billed using labor-guide times, with WorldPac parts at list price.",
    symptoms: [
      "Check-engine or another warning light stays on or keeps coming back",
      "Slow cranking, a dead battery, or a battery light while driving",
      "Rough idle, hesitation, lost power, or higher fuel use",
      "Intermittent stalling, no-start, or electrical faults",
    ],
    inspections: [
      "Stored and pending trouble codes",
      "Battery, charging, and starting system tests",
      "Live data, wiring, connectors, and the related components",
    ],
    safetyBody:
      "A flashing check-engine light, overheating, an oil-pressure warning, smoke, or a strong fuel smell may mean you should stop driving. Get roadside help if continuing could be unsafe.",
    process: [
      "Send the warning lights, symptoms, and when they appear",
      "Scan and test the related systems instead of replacing parts from a code alone",
      "Review findings, any further testing, and repair options before approving",
    ],
    pricingBody:
      "Once the cause is found, the repair is billed by the labor-guide time, plus parts. These are common electrical and engine repairs from real quotes.",
    pricingRows: [
      {
        job: "12-volt battery",
        laborTime: "0.3–0.7 h",
        total: "$244–$634",
        examples: "2016 Mazda3: $258–$466 · 2017 Honda CR-V: $334–$430 · 2019 Toyota Camry: $266–$634",
      },
      {
        job: "Alternator",
        laborTime: "0.8–3.6 h",
        total: "$675–$1,866",
        examples: "2020 Toyota RAV4: $675–$988 · 2016 Toyota Highlander: $707–$1,002",
      },
      {
        job: "Starter motor",
        laborTime: "1.4 h",
        total: "$683–$901",
        examples: "2015 Nissan Altima: $683–$901",
      },
      {
        job: "Oxygen sensor",
        laborTime: "0.5–1.0 h",
        total: "$405–$626",
        examples: "2016 Honda Civic: $405–$611 · 2018 Toyota Camry (upstream): $512–$626",
      },
      {
        job: "Engine thermostat",
        laborTime: "1.6–2.4 h",
        total: "$215–$391",
        examples: "2018 Toyota Camry: $215–$336 · 2016 Toyota Highlander: $302–$391",
      },
    ],
    faqs: [
      {
        question: "Does a code tell you exactly which part to replace?",
        answer: "Usually not. A code points to a system or condition, and testing finds the actual cause.",
      },
      {
        question: "How much does a car battery replacement cost?",
        answer:
          "On the vehicles we have quoted, $244–$634 including the battery and installation, depending on the battery size and type your vehicle needs.",
      },
      {
        question: "How do I know if it's the battery or the alternator?",
        answer:
          "A battery that keeps going flat can be either. We test the battery, the charging output, and the starter so you only replace what has failed.",
      },
      {
        question: "Can you diagnose an intermittent problem?",
        answer:
          "Often, but it may take extra time or repeat testing. Notes on when the problem happens help a lot.",
      },
      {
        question: "Should I drive with a flashing check-engine light?",
        answer:
          "A flashing light can mean a serious active fault. Stop when it is safe and get professional advice.",
      },
      {
        question: "Can the online estimate assistant help with a warning light?",
        answer:
          "It can suggest likely causes and price common repairs, but a warning light needs a scan and testing at the shop before we can confirm the repair.",
      },
    ],
    ctaBody: "Send the warning light, the symptoms, and the vehicle so we can plan the diagnosis.",
  },
  suspension: {
    metaTitle: "Suspension & Steering Repair in Richmond, BC",
    metaDescription:
      "Struts, shocks, sway bar links, wheel bearings, and CV axles in Richmond near YVR. Real price examples; Labor by labor-guide times.",
    eyebrow: "Suspension and steering",
    title: "Suspension and Steering Repair",
    serviceType: "Suspension and steering repair",
    summary:
      "SPEEDX AUTO inspects and repairs clunks, looseness, pulling, vibration, and uneven tire wear at our Richmond shop near YVR, including struts, shocks, sway bar links, wheel bearings, and CV axles. Similar symptoms can come from several parts, so we inspect first. Labor is billed using industry-standard labor-guide times, with WorldPac parts at list price.",
    symptoms: [
      "Clunks, knocks, or squeaks over bumps",
      "Pulling, wandering, or constant steering correction",
      "Steering that feels heavier, looser, or different",
      "Uneven tire wear, a humming wheel bearing, or vibration at speed",
    ],
    inspections: [
      "Struts, shocks, mounts, bushings, and steering joints",
      "Wheel bearings, CV axles, and their boots",
      "Tire wear patterns and symptoms on a suitable road or shop check",
    ],
    safetyBody:
      "Steering and suspension faults affect stability. Sudden looseness, severe vibration, or loss of steering response calls for caution and may need a tow.",
    process: [
      "Describe the noise or handling change and when it happens",
      "Inspect the tires, steering, suspension, and driveline",
      "Review findings and approve the work after you see the quote",
    ],
    pricingBody:
      "Suspension labor is billed by the labor-guide time for your vehicle, plus parts at WorldPac list price.",
    pricingRows: [
      {
        job: "Front strut assemblies",
        laborTime: "1.9–2.4 h",
        total: "$446–$873",
        examples: "2019 Subaru Outback: $446–$734 · 2015 Honda Accord: $500–$873",
      },
      {
        job: "Rear shock or strut assemblies",
        laborTime: "1.6 h",
        total: "$467–$641",
        examples: "2015 Honda Accord: $467–$641",
      },
      {
        job: "Front strut mount",
        laborTime: "3.4 h",
        total: "$582–$712",
        examples: "2015 Honda Accord: $582–$712",
      },
      {
        job: "Front sway bar links",
        laborTime: "0.4 h",
        total: "$187–$257",
        examples: "2015 Honda Accord: $187–$257",
      },
      {
        job: "Front CV axle",
        laborTime: "2.2 h",
        total: "$863–$1,851",
        examples: "2016 Toyota RAV4: $863–$1,851",
      },
      {
        job: "Front wheel hub and bearing",
        laborTime: "1.2 h",
        total: "$130–$158 labor + part",
        examples: "2020 Kia Sorento",
      },
    ],
    faqs: [
      {
        question: "How much does it cost to replace front struts?",
        answer:
          "On the vehicles we have quoted, $446–$873 including parts and labor: for example $446–$734 on a 2019 Subaru Outback and $500–$873 on a 2015 Honda Accord.",
      },
      {
        question: "What is the clunk over bumps?",
        answer:
          "Common causes are sway bar links, strut mounts, worn bushings, or struts. Sway bar links are among the cheaper fixes, about $187–$257 on a 2015 Honda Accord.",
      },
      {
        question: "Does pulling always mean the vehicle needs an alignment?",
        answer:
          "No. Tires, brakes, steering, and suspension parts can all cause pulling, so we inspect first.",
      },
      {
        question: "Can worn suspension cause uneven tire wear?",
        answer: "It can. We look at the tires, steering, and suspension together.",
      },
      {
        question: "Is a humming noise that changes with speed a wheel bearing?",
        answer:
          "It often is, but tires can make a similar sound. We check the bearings and tires before recommending a repair.",
      },
      {
        question: "Is a clunk safe to ignore?",
        answer: "A sound alone doesn't tell us. Book an inspection, especially if the steering or handling has changed.",
      },
    ],
    ctaBody: "Tell us when the noise, vibration, or steering change happens and we will book the inspection.",
  },
  "tesla-ev": {
    metaTitle: "Tesla & EV Repair in Richmond, BC",
    metaDescription:
      "Independent Tesla and EV repair in Richmond near YVR: high-voltage battery checks, drive motor repair, fault-code diagnosis, brakes, suspension, and tires.",
    eyebrow: "Tesla and electric vehicles",
    title: "Tesla and Electric Vehicle Repair",
    serviceType: "Electric vehicle repair",
    summary:
      "SPEEDX AUTO repairs electric vehicles, mainly Tesla, at our shop at 2980 Number 3 Road in Richmond near YVR. We check high-voltage batteries, repair drive motors, read and diagnose fault codes, and handle EV brakes, suspension, tires, and maintenance. Labor is billed by industry-standard labor-guide times. Appointments are required, and we speak English, Cantonese, and Mandarin.",
    symptoms: [
      "Battery or drive-system alerts on the screen, or alerts that return after a restart",
      "Range or power that drops for no clear reason",
      "Whining, grinding, or clunking from the drive unit when accelerating or slowing",
      "Brake noise, suspension clunks, or tires wearing quickly",
    ],
    inspections: [
      "Fault codes and alert history",
      "High-voltage battery condition",
      "Drive motor noise, leaks, and mounts",
      "Brakes, calipers, suspension, and tires",
    ],
    safetyBody:
      "Never open or work on high-voltage parts yourself; orange cables carry dangerous voltage. If the car warns of a battery fault, smokes, or smells of burning, park away from buildings, get everyone out, and call 911.",
    process: [
      "Send the model, year, mileage, and a photo of any alert on the screen",
      "Book a time and bring the car to the Richmond shop",
      "Review the diagnosis, options, and quote before approving work",
    ],
    pricingBody:
      "Repairs and diagnosis on EVs are billed the same way, using labor-guide times, with parts quoted before work starts. Tire changes and A/C recharges use the shop's flat prices.",
    pricingRows: [
      {
        job: "Repairs and diagnosis",
        laborTime: "Labor-guide time",
        total: "Labor-guide time + parts",
        examples: "Quoted before work starts",
      },
      {
        job: "Tire change, per tire",
        laborTime: "Flat price",
        total: "$25–$35",
        examples: "Up to 18 in. $25 · over 18 in. $30 · run-flat $35; tires extra",
      },
      {
        job: "A/C refrigerant recharge",
        laborTime: "Flat price",
        total: "$150 or $230",
        examples: "R-134a $150 · R-1234yf $230, confirmed from the label",
      },
    ],
    pricingFootnote: "Prices before tax. Parts are quoted at WorldPac list price before work starts.",
    faqs: [
      {
        question: "Can you repair a Tesla?",
        answer:
          "Yes. Tesla is most of our EV work: high-voltage battery checks, drive motor repair, fault-code diagnosis, plus brakes, suspension, tires, and maintenance.",
      },
      {
        question: "Can you check my Tesla's high-voltage battery?",
        answer:
          "Yes. We check the battery's condition and any related fault codes, then explain what we found and your options before any repair.",
      },
      {
        question: "Do electric cars still need maintenance?",
        answer:
          "Yes. Tires, brakes, cabin filters, the A/C system, and the 12-volt battery all need attention. Regenerative braking means the pads work less, so calipers can seize or corrode in a wet climate like Vancouver's. Follow the schedule in your owner's manual.",
      },
      {
        question: "How much does Tesla repair cost?",
        answer:
          "Labor is billed by the labor-guide time, plus parts, and you get the quote before work starts. Tire changes start at $25 per tire and A/C recharges are $150 or $230.",
      },
      {
        question: "Do you work on other EV brands?",
        answer: "Sometimes. Send the make, model, and the problem first and we will confirm whether we can take the job.",
      },
      {
        question: "Do I need an appointment?",
        answer: "Yes. Book by WhatsApp, phone, or WeChat.",
      },
    ],
    ctaBody: "Send your Tesla's model, year, and a photo of any alert to book a diagnosis.",
  },
};

export const enRepairServices = withLabels(enLabels, enSeeds);

// --------------------------------------------------------- Simplified Chinese

const zhCNLabels: ServiceLabels = {
  symptomsTitle: "什么时候该来检查",
  inspectionsTitle: "我们会检查什么",
  safetyTitle: "安全与诊断说明",
  processTitle: "接下来的流程",
  serviceAreaTitle: "维修服务区域",
  serviceAreaBody:
    "SPEEDX AUTO 的车间位于列治文 2980 Number 3 Road，靠近 YVR，服务列治文、温哥华、本拿比、三角洲、素里及大温各地车主。需要预约，店里讲普通话、粤语和英语。",
  faqTitle: "常见问题",
  ctaTitle: "预约这项维修",
  lastUpdated: "更新于 2026 年 10 月 12 日",
  pricingTitle: "大概多少钱",
  pricingColumns: {
    job: "项目",
    laborTime: "标准工时",
    total: "总价区间",
    examples: "实例",
  },
  pricingFootnote:
    "以上为配件加工时的税前总价，取自 2026 年 10 月 11–12 日估价助手生成的真实报价，基于 WorldPac 标价和标准工时，并和估价助手一样上下各放宽 10%。实际价格取决于具体车型和所选配件，检查时也可能发现其他问题。开工前我们会先和您确认报价。",
  relatedTitle: "其他维修项目",
};

const zhCNSeeds: ServiceSeeds = {
  maintenance: {
    metaTitle: "列治文换机油与汽车保养",
    metaDescription:
      "列治文换机油 $95 起（含机油机滤），换胎、空调加冷媒、皮带、滤芯、定期保养。工时费按标准工时计费。",
    eyebrow: "保养",
    title: "换机油与定期保养",
    serviceType: "汽车保养",
    summary:
      "SPEEDX AUTO 在列治文靠近 YVR 的车间提供换机油、换胎、空调加冷媒、更换滤芯和皮带、冷却液保养等定期保养项目。换机油 95 加元起，含机油和机滤。其他项目按行业标准工时计费，配件来自 WorldPac，按标价报价。来之前请准备好里程和保养记录，我们会告诉您哪些项目确实到期。",
    symptoms: [
      "到了换机油时间，或仪表盘出现保养提醒",
      "换季换胎，或轮胎磨损明显、不均匀",
      "空调不凉，或出风口有霉味",
      "刚买了二手车，想先做一次全面检查",
    ],
    inspections: [
      "各种油液的液位、状态和渗漏迹象",
      "轮胎、刹车、灯光、雨刮、皮带和滤芯",
      "仪表盘提示，以及按里程到期的保养项目",
    ],
    safetyBody: "保养需求因车型、里程和用车方式而异。我们先检查，说明哪些项目到期，由您决定做哪些。",
    process: [
      "发送车型、里程和想做的项目",
      "和列治文车间约好时间",
      "看过检查结果后，只批准您要做的项目",
    ],
    pricingBody: "换机油、换胎和空调加冷媒按店里价目表一口价，其他项目按标准工时计费，再加配件费。",
    pricingRows: [
      {
        job: "换机油：普通轿车 / 小 SUV",
        laborTime: "一口价",
        total: "$95 或 $120",
        examples: "普通机油 0W-20 $95 · 高级机油 0W-30 $120，含机油和机滤",
      },
      {
        job: "换机油：大型 SUV / 皮卡",
        laborTime: "一口价",
        total: "$150 或 $180",
        examples: "普通机油 0W-20 $150 · 高级机油 0W-30 $180",
      },
      {
        job: "换胎（每条）",
        laborTime: "一口价",
        total: "$25–$45",
        examples: "18 寸及以下 $25 · 18 寸以上 $30 · 防爆胎 $35 · AT/RT/MT 越野胎 $45；轮胎另计",
      },
      {
        job: "空调加冷媒（雪种）",
        laborTime: "一口价",
        total: "$150 或 $230",
        examples: "R-134a（旧系统）$150 · R-1234yf（新系统）$230",
      },
      {
        job: "换空调滤芯",
        laborTime: "0.3 小时",
        total: "$77–$95",
        examples: "2017 本田 CR-V：$77–$95",
      },
      {
        job: "换发动机皮带",
        laborTime: "0.4–0.6 小时",
        total: "$88–$160",
        examples: "2015 本田雅阁：$88–$108 · 2018 丰田卡罗拉：$101–$160",
      },
      {
        job: "换正时皮带",
        laborTime: "3.5 小时",
        total: "$519–$635",
        examples: "2012 本田奥德赛：$519–$635",
      },
      {
        job: "更换冷却液",
        laborTime: "1.2 小时",
        total: "工时 $130–$158 + 冷却液",
        examples: "2016 丰田汉兰达",
      },
    ],
    faqs: [
      {
        question: "换机油多少钱？",
        answer:
          "普通轿车或小 SUV：普通机油 0W-20 为 95 加元，高级机油 0W-30 为 120 加元，含机油和机滤。大型 SUV 或皮卡 150 / 180 加元，欧洲车原厂机油 220 加元，柴油车 280–320 加元。V8 发动机由团队单独报价。",
      },
      {
        question: "换胎多少钱？",
        answer: "每条胎：18 寸及以下 25 加元，18 寸以上 30 加元，防爆胎 35 加元，AT/RT/MT 越野胎 45 加元。轮胎购买费用另计。",
      },
      {
        question: "空调加冷媒多少钱？",
        answer: "使用 R-134a 的系统（多为老车）150 加元，使用 R-1234yf 的系统（多数新车）230 加元。冷媒类型以发动机舱内的标签为准。",
      },
      {
        question: "每辆车的保养周期都一样吗？",
        answer: "不一样。要看车型、里程、用车方式和以往的保养记录。",
      },
      {
        question: "刚买的二手车可以来检查吗？",
        answer: "可以。请发送车辆资料和想检查的内容，我们安排合适的检查。",
      },
      {
        question: "开工前会先报价吗？",
        answer: "会。我们先和您确认检查结果和价格，您同意后才开工。",
      },
    ],
    ctaBody: "发送车型、里程和需要的保养项目，约个时间。",
  },
  brakes: {
    metaTitle: "列治文刹车维修：刹车片、刹车盘、刹车油",
    metaDescription:
      "列治文刹车片、刹车盘、卡钳、刹车油维修，靠近 YVR。多数 2015–2020 年车型换前刹车片含配件 $185–$444。工时费按标准工时计费。",
    eyebrow: "刹车",
    title: "刹车检查与维修",
    serviceType: "刹车维修",
    summary:
      "SPEEDX AUTO 在列治文靠近 YVR 的车间检查和维修刹车：刹车片、刹车盘、卡钳、刹车油和刹车故障灯。多数 2015–2020 年车型换前刹车片，含配件 185–444 加元。工时费按行业标准工时计费。如果刹车感觉不安全或突然变化，请在安全时停车并安排拖车。",
    symptoms: [
      "刹车时尖叫、摩擦或刮擦声",
      "刹车时方向盘或踏板抖动",
      "刹车踏板变软、变低、变硬或感觉不一样",
      "刹车或 ABS 故障灯亮起",
    ],
    inspections: [
      "刹车片厚度、刹车盘状况、卡钳及配件",
      "刹车油状态和渗漏",
      "故障灯，以及在合适条件下复现的症状",
    ],
    safetyBody: "刹车问题直接影响车辆控制。不要凭网页内容判断车能不能开；需要时请安排拖车或道路救援。",
    process: [
      "说明异响、踏板感觉、故障灯和出现的时机",
      "开车或拖车到店做刹车检查",
      "看过测量结果、可选方案和报价后再批准维修",
    ],
    pricingBody: "刹车工时按您这款车的标准工时计费，配件按 WorldPac 标价。多数报价会列出两到三种不同价位的刹车片或刹车盘供您选择。",
    pricingRows: [
      {
        job: "换前刹车片",
        laborTime: "0.8–1.1 小时",
        total: "$185–$444",
        examples: "2018 丰田卡罗拉：$185–$227 · 2018 本田思域：$216–$311 · 2019 丰田凯美瑞：$262–$350",
      },
      {
        job: "换后刹车片",
        laborTime: "0.9–1.1 小时",
        total: "$204–$356",
        examples: "2019 丰田凯美瑞：$204–$290 · 2018 奔驰 C300：$292–$356",
      },
      {
        job: "换前刹车盘",
        laborTime: "0.7 小时",
        total: "$329–$403",
        examples: "2020 丰田 RAV4 LE：$329–$403",
      },
      {
        job: "换后刹车盘",
        laborTime: "0.8 小时",
        total: "$398–$486",
        examples: "2020 丰田 RAV4 LE：$398–$486",
      },
      {
        job: "刹车油排气 / 更换",
        laborTime: "0.9 小时",
        total: "$106–$215",
        examples: "2017 本田 CR-V：$106–$215",
      },
      {
        job: "换刹车总泵",
        laborTime: "1.6 小时",
        total: "$962–$1,176",
        examples: "2017 本田 CR-V：$962–$1,176",
      },
    ],
    faqs: [
      {
        question: "换前刹车片多少钱？",
        answer:
          "多数 2015–2020 年车型含配件和工时 185–444 加元。例如 2018 丰田卡罗拉 185–227 加元，2019 丰田凯美瑞 262–350 加元。您这辆车的报价会列出具体的刹车片选项。",
      },
      {
        question: "换刹车片一定要换刹车盘吗？",
        answer: "不一定。我们会测量刹车盘，检查有没有沟痕或抖动，再告诉您能不能继续用。",
      },
      {
        question: "刹车有异响就是刹车片磨完了吗？",
        answer: "不一定。异响有多种原因，我们会先检查刹车系统再选配件。",
      },
      {
        question: "刹车故障灯亮了还能开吗？",
        answer: "故障灯需要检查。如果刹车感觉变了或不安全，请在安全时停车并寻求帮助。",
      },
      {
        question: "刹车工时怎么算？",
        answer: "按您这款车的标准工时计费。例如 2019 丰田凯美瑞 LE 换前刹车片标准工时 1.1 小时。",
      },
      {
        question: "换配件前会先报价吗？",
        answer: "会。您会先看到检查结果、配件选项和总价，同意后才开工。",
      },
    ],
    ctaBody: "告诉我们刹车症状、故障灯和车型，预约检查。",
  },
  diagnostics: {
    metaTitle: "列治文发动机故障灯检测与汽车电路维修",
    metaDescription:
      "列治文发动机故障灯、电瓶、发电机、启动马达、传感器检测与维修，靠近 YVR。附真实报价实例；工时费按标准工时计费。",
    eyebrow: "故障诊断与电路",
    title: "发动机故障灯、电瓶与电路诊断",
    serviceType: "汽车故障诊断",
    summary:
      "SPEEDX AUTO 在列治文靠近 YVR 的车间诊断发动机故障灯、各种警示灯、怠速不稳、无法启动以及电瓶和充电系统问题。故障码只指向某个系统，不等于某个零件坏了，所以我们会先测试再换件。维修按标准工时计费，配件来自 WorldPac，按标价报价。",
    symptoms: [
      "发动机故障灯或其他警示灯常亮或反复出现",
      "启动无力、电瓶没电，或行驶中电瓶灯亮",
      "怠速抖动、加速迟缓、动力下降或油耗变高",
      "间歇性熄火、无法启动或电路故障",
    ],
    inspections: [
      "已存储和待定的故障码",
      "电瓶、充电和启动系统测试",
      "实时数据、线路、插头和相关部件",
    ],
    safetyBody: "发动机故障灯闪烁、水温过高、机油压力警告、冒烟或有明显汽油味时，可能需要停止驾驶。如果继续开有危险，请叫道路救援。",
    process: [
      "发送警示灯、症状和出现的时机",
      "扫描并测试相关系统，不只凭故障码换件",
      "看过诊断结果、是否需要进一步测试和维修方案后再批准",
    ],
    pricingBody: "找到原因后，维修按标准工时计费，加配件费。以下是常见电路和发动机维修的真实报价。",
    pricingRows: [
      {
        job: "换 12V 电瓶",
        laborTime: "0.3–0.7 小时",
        total: "$244–$634",
        examples: "2016 马自达 3：$258–$466 · 2017 本田 CR-V：$334–$430 · 2019 丰田凯美瑞：$266–$634",
      },
      {
        job: "换发电机",
        laborTime: "0.8–3.6 小时",
        total: "$675–$1,866",
        examples: "2020 丰田 RAV4：$675–$988 · 2016 丰田汉兰达：$707–$1,002",
      },
      {
        job: "换启动马达",
        laborTime: "1.4 小时",
        total: "$683–$901",
        examples: "2015 日产天籁：$683–$901",
      },
      {
        job: "换氧传感器",
        laborTime: "0.5–1.0 小时",
        total: "$405–$626",
        examples: "2016 本田思域：$405–$611 · 2018 丰田凯美瑞（前氧）：$512–$626",
      },
      {
        job: "换节温器",
        laborTime: "1.6–2.4 小时",
        total: "$215–$391",
        examples: "2018 丰田凯美瑞：$215–$336 · 2016 丰田汉兰达：$302–$391",
      },
    ],
    faqs: [
      {
        question: "故障码能直接告诉你换哪个零件吗？",
        answer: "通常不能。故障码指向某个系统或状况，要通过测试找到真正原因。",
      },
      {
        question: "换汽车电瓶多少钱？",
        answer: "按我们报过价的车型，含电瓶和安装 244–634 加元，取决于您的车需要的电瓶规格和类型。",
      },
      {
        question: "怎么知道是电瓶坏了还是发电机坏了？",
        answer: "电瓶老是没电，两者都有可能。我们会测试电瓶、充电输出和启动马达，只换真正坏的部件。",
      },
      {
        question: "间歇性故障能查出来吗？",
        answer: "多数可以，但可能需要更多时间或反复测试。记下故障出现的情况会很有帮助。",
      },
      {
        question: "发动机故障灯闪烁还能开吗？",
        answer: "闪烁可能表示严重的故障正在发生。请在安全时停车并寻求专业意见。",
      },
      {
        question: "网上估价助手能帮我看故障灯吗？",
        answer: "它可以给出可能的原因，并估算常见维修的价格，但故障灯需要到店扫描和测试，才能确认要修什么。",
      },
    ],
    ctaBody: "发送故障灯、症状和车型，我们安排诊断。",
  },
  suspension: {
    metaTitle: "列治文悬挂与转向维修",
    metaDescription:
      "列治文减震器、平衡杆连杆、轮毂轴承、半轴维修，靠近 YVR。附真实报价实例；工时费按标准工时计费。",
    eyebrow: "悬挂与转向",
    title: "悬挂与转向维修",
    serviceType: "悬挂与转向维修",
    summary:
      "SPEEDX AUTO 在列治文靠近 YVR 的车间检查和维修过坎异响、松旷、跑偏、抖动和轮胎偏磨，包括减震器、平衡杆连杆、轮毂轴承和半轴。相似的症状可能来自不同零件，所以我们先检查。工时费按行业标准工时计费，配件来自 WorldPac，按标价报价。",
    symptoms: [
      "过减速带或坑洼时咯噔、咚咚或吱吱响",
      "车辆跑偏、发飘，需要不停修正方向",
      "方向盘变沉、变松或手感不对",
      "轮胎偏磨、轮毂轴承嗡嗡响，或高速抖动",
    ],
    inspections: [
      "减震器、顶胶、衬套和转向球头",
      "轮毂轴承、半轴及防尘套",
      "轮胎磨损情况，以及路试或车间内复现的症状",
    ],
    safetyBody: "转向和悬挂故障会影响车辆稳定。突然松旷、严重抖动或方向失灵时请格外小心，可能需要拖车。",
    process: [
      "说明异响或操控变化，以及出现的时机",
      "检查轮胎、转向、悬挂和传动部件",
      "看过检查结果和报价后再批准维修",
    ],
    pricingBody: "悬挂工时按您这款车的标准工时计费，配件按 WorldPac 标价。",
    pricingRows: [
      {
        job: "换前减震器总成",
        laborTime: "1.9–2.4 小时",
        total: "$446–$873",
        examples: "2019 斯巴鲁傲虎：$446–$734 · 2015 本田雅阁：$500–$873",
      },
      {
        job: "换后减震器总成",
        laborTime: "1.6 小时",
        total: "$467–$641",
        examples: "2015 本田雅阁：$467–$641",
      },
      {
        job: "换前减震顶胶",
        laborTime: "3.4 小时",
        total: "$582–$712",
        examples: "2015 本田雅阁：$582–$712",
      },
      {
        job: "换前平衡杆连杆",
        laborTime: "0.4 小时",
        total: "$187–$257",
        examples: "2015 本田雅阁：$187–$257",
      },
      {
        job: "换前半轴",
        laborTime: "2.2 小时",
        total: "$863–$1,851",
        examples: "2016 丰田 RAV4：$863–$1,851",
      },
      {
        job: "换前轮毂轴承",
        laborTime: "1.2 小时",
        total: "工时 $130–$158 + 配件",
        examples: "2020 起亚索兰托",
      },
    ],
    faqs: [
      {
        question: "换前减震器多少钱？",
        answer: "按我们报过价的车型，含配件和工时 446–873 加元，例如 2019 斯巴鲁傲虎 446–734 加元，2015 本田雅阁 500–873 加元。",
      },
      {
        question: "过坎咯噔响是什么问题？",
        answer: "常见原因有平衡杆连杆、减震顶胶、衬套老化或减震器损坏。平衡杆连杆是比较便宜的一种，2015 本田雅阁约 187–257 加元。",
      },
      {
        question: "跑偏一定是要做四轮定位吗？",
        answer: "不一定。轮胎、刹车、转向和悬挂部件都可能导致跑偏，所以我们先检查。",
      },
      {
        question: "悬挂磨损会导致轮胎偏磨吗？",
        answer: "会。我们会把轮胎、转向和悬挂一起检查。",
      },
      {
        question: "随车速变化的嗡嗡声是轮毂轴承坏了吗？",
        answer: "经常是，但轮胎也可能发出类似声音。我们会先检查轴承和轮胎再建议维修。",
      },
      {
        question: "有咯噔声可以不管吗？",
        answer: "光听声音无法判断。请预约检查，尤其是方向或操控已经有变化时。",
      },
    ],
    ctaBody: "告诉我们异响、抖动或方向变化出现的时机，我们安排检查。",
  },
  "tesla-ev": {
    metaTitle: "列治文特斯拉维修 · 电动车维修",
    metaDescription:
      "列治文独立特斯拉和电动车维修，靠近 YVR：高压电池检测、驱动电机维修、故障码诊断、刹车、悬挂、轮胎。工时费按标准工时计费。普通话、粤语、英语服务。",
    eyebrow: "特斯拉与电动车",
    title: "特斯拉与电动车维修",
    serviceType: "电动车维修",
    summary:
      "SPEEDX AUTO 在列治文 2980 Number 3 Road、靠近 YVR 的车间维修电动车，以特斯拉为主。我们做高压电池检测、驱动电机维修、故障码读取与诊断，以及电动车的刹车、悬挂、轮胎和保养。工时费按行业标准工时计费。需要预约，店里讲普通话、粤语和英语。",
    symptoms: [
      "屏幕出现电池或驱动系统警告，或重启后警告仍然出现",
      "续航或动力无故下降",
      "加速或减速时驱动电机有啸叫、摩擦或咯噔声",
      "刹车异响、悬挂异响，或轮胎磨损很快",
    ],
    inspections: ["故障码和警告记录", "高压电池状况", "驱动电机的异响、渗漏和支架", "刹车、卡钳、悬挂和轮胎"],
    safetyBody:
      "千万不要自己打开或处理高压部件，橙色线缆带有危险电压。如果车辆提示电池故障、冒烟或有焦味，请把车停在远离建筑物的地方，所有人下车，并拨打 911。",
    process: [
      "发送车型、年份、里程和屏幕警告的照片",
      "约好时间，把车开到列治文车间",
      "看过诊断结果、方案和报价后再批准维修",
    ],
    pricingBody: "电动车的维修和诊断同样按标准工时计费，配件开工前报价。换胎和空调加冷媒按店里的一口价。",
    pricingRows: [
      {
        job: "维修与诊断",
        laborTime: "标准工时",
        total: "标准工时 + 配件",
        examples: "开工前报价",
      },
      {
        job: "换胎（每条）",
        laborTime: "一口价",
        total: "$25–$35",
        examples: "18 寸及以下 $25 · 18 寸以上 $30 · 防爆胎 $35；轮胎另计",
      },
      {
        job: "空调加冷媒（雪种）",
        laborTime: "一口价",
        total: "$150 或 $230",
        examples: "R-134a $150 · R-1234yf $230，以标签为准",
      },
    ],
    pricingFootnote: "以上为税前价格。配件按 WorldPac 标价，开工前报价。",
    faqs: [
      {
        question: "能修特斯拉吗？",
        answer: "能。我们的电动车业务以特斯拉为主：高压电池检测、驱动电机维修、故障码诊断，以及刹车、悬挂、轮胎和保养。",
      },
      {
        question: "可以检测特斯拉的高压电池吗？",
        answer: "可以。我们检查电池状况和相关故障码，维修前先向您说明结果和可选方案。",
      },
      {
        question: "电动车还需要保养吗？",
        answer:
          "需要。轮胎、刹车、空调滤芯、空调系统和 12V 小电瓶都需要定期照顾。动能回收让刹车片用得少，在温哥华这样潮湿的气候里，卡钳反而容易卡滞或锈蚀。请参照车主手册的保养周期。",
      },
      {
        question: "修特斯拉大概多少钱？",
        answer: "工时费按标准工时计算，加配件费，开工前给您报价。换胎每条 25 加元起，空调加冷媒 150 或 230 加元。",
      },
      {
        question: "其他品牌的电动车能修吗？",
        answer: "部分可以。请先发送品牌、车型和问题，我们确认能否承接。",
      },
      {
        question: "需要预约吗？",
        answer: "需要。请通过 WhatsApp、电话或微信预约。",
      },
    ],
    ctaBody: "发送特斯拉的车型、年份和屏幕警告照片，预约诊断。",
  },
};

export const zhCNRepairServices = withLabels(zhCNLabels, zhCNSeeds);

// -------------------------------------------------------- Traditional Chinese

const zhTWLabels: ServiceLabels = {
  symptomsTitle: "甚麼時候應該來檢查",
  inspectionsTitle: "我們會檢查甚麼",
  safetyTitle: "安全與診斷說明",
  processTitle: "接下來的流程",
  serviceAreaTitle: "維修服務範圍",
  serviceAreaBody:
    "SPEEDX AUTO 的車房位於列治文 2980 Number 3 Road，鄰近 YVR，服務列治文、溫哥華、本拿比、三角洲、素里及大溫各區車主。須預約，店內可說粵語、普通話及英語。",
  faqTitle: "常見問題",
  ctaTitle: "預約這項維修",
  lastUpdated: "更新於 2026 年 10 月 12 日",
  pricingTitle: "大概要多少錢",
  pricingColumns: {
    job: "項目",
    laborTime: "標準工時",
    total: "總價範圍",
    examples: "實例",
  },
  pricingFootnote:
    "以上為零件加工時的未連稅總價，取自 2026 年 10 月 11–12 日估價助手產生的真實報價，根據 WorldPac 標價及標準工時，並與估價助手一樣上下各放寬 10%。實際價錢視乎具體車款和所選零件，檢查時亦可能發現其他問題。開工前我們會先與您確認報價。",
  relatedTitle: "其他維修項目",
};

const zhTWSeeds: ServiceSeeds = {
  maintenance: {
    metaTitle: "列治文換機油及汽車保養",
    metaDescription:
      "列治文車房換機油 $95 起（已包機油及機油格），換胎、冷氣加雪種、皮帶、濾網、定期保養。工時費按標準工時收費。",
    eyebrow: "保養",
    title: "換機油及定期保養",
    serviceType: "汽車保養",
    summary:
      "SPEEDX AUTO 在列治文鄰近 YVR 的車房提供換機油、換胎、冷氣加雪種、更換濾網和皮帶、冷卻液保養等定期保養。換機油 95 加元起，已包機油及機油格。其他項目按行業標準工時收費，零件來自 WorldPac，按標價報價。來之前請準備里程和保養紀錄，我們會告訴您哪些項目真正到期。",
    symptoms: [
      "到了換機油時間，或儀錶板出現保養提示",
      "換季換胎，或輪胎明顯磨損、磨損不均",
      "冷氣不凍，或出風口有霉味",
      "剛買了二手車，想先做一次全面檢查",
    ],
    inspections: [
      "各種油液的份量、狀態和滲漏跡象",
      "輪胎、煞車、燈光、水撥、皮帶和濾網",
      "儀錶板提示，以及按里程到期的保養項目",
    ],
    safetyBody: "保養需要因車款、里程和用車方式而異。我們先檢查，說明哪些項目到期，由您決定做哪些。",
    process: [
      "傳送車款、里程和想做的項目",
      "與列治文車房約好時間",
      "看過檢查結果後，只批准您要做的項目",
    ],
    pricingBody: "換機油、換胎和冷氣加雪種按車房價目表一口價，其他項目按標準工時收費，另加零件費。",
    pricingRows: [
      {
        job: "換機油：一般轎車 / 小型 SUV",
        laborTime: "一口價",
        total: "$95 或 $120",
        examples: "普通機油 0W-20 $95 · 高級機油 0W-30 $120，已包機油及機油格",
      },
      {
        job: "換機油：大型 SUV / 皮卡",
        laborTime: "一口價",
        total: "$150 或 $180",
        examples: "普通機油 0W-20 $150 · 高級機油 0W-30 $180",
      },
      {
        job: "換胎（每條）",
        laborTime: "一口價",
        total: "$25–$45",
        examples: "18 吋或以下 $25 · 18 吋以上 $30 · 防爆胎 $35 · AT/RT/MT 越野胎 $45；輪胎另計",
      },
      {
        job: "冷氣加雪種（冷媒）",
        laborTime: "一口價",
        total: "$150 或 $230",
        examples: "R-134a（舊系統）$150 · R-1234yf（新系統）$230",
      },
      {
        job: "更換冷氣濾網",
        laborTime: "0.3 小時",
        total: "$77–$95",
        examples: "2017 Honda CR-V：$77–$95",
      },
      {
        job: "更換引擎皮帶",
        laborTime: "0.4–0.6 小時",
        total: "$88–$160",
        examples: "2015 Honda Accord：$88–$108 · 2018 Toyota Corolla：$101–$160",
      },
      {
        job: "更換正時皮帶（坑帶）",
        laborTime: "3.5 小時",
        total: "$519–$635",
        examples: "2012 Honda Odyssey：$519–$635",
      },
      {
        job: "更換冷卻液",
        laborTime: "1.2 小時",
        total: "工時 $130–$158 + 冷卻液",
        examples: "2016 Toyota Highlander",
      },
    ],
    faqs: [
      {
        question: "換機油要多少錢？",
        answer:
          "一般轎車或小型 SUV：普通機油 0W-20 為 95 加元，高級機油 0W-30 為 120 加元，已包機油及機油格。大型 SUV 或皮卡 150 / 180 加元，歐洲車原廠機油 220 加元，柴油車 280–320 加元。V8 引擎由團隊另行報價。",
      },
      {
        question: "換胎要多少錢？",
        answer: "每條胎：18 吋或以下 25 加元，18 吋以上 30 加元，防爆胎 35 加元，AT/RT/MT 越野胎 45 加元。購買輪胎的費用另計。",
      },
      {
        question: "冷氣加雪種要多少錢？",
        answer: "使用 R-134a 的系統（多為舊車）150 加元，使用 R-1234yf 的系統（大部分新車）230 加元。雪種類型以引擎室內的標籤為準。",
      },
      {
        question: "每部車的保養周期都一樣嗎？",
        answer: "不一樣。要視乎車款、里程、用車方式和以往的保養紀錄。",
      },
      {
        question: "剛買的二手車可以來檢查嗎？",
        answer: "可以。請傳送車輛資料和想檢查的內容，我們安排合適的檢查。",
      },
      {
        question: "開工前會先報價嗎？",
        answer: "會。我們先與您確認檢查結果和價錢，您同意後才開工。",
      },
    ],
    ctaBody: "傳送車款、里程和需要的保養項目，約個時間。",
  },
  brakes: {
    metaTitle: "列治文煞車維修：煞車片、煞車碟、煞車油",
    metaDescription:
      "列治文車房煞車片、煞車碟、卡鉗、煞車油維修，鄰近 YVR。大部分 2015–2020 年車款換前煞車片連零件 $185–$444。工時費按標準工時收費。",
    eyebrow: "煞車",
    title: "煞車檢查及維修",
    serviceType: "煞車維修",
    summary:
      "SPEEDX AUTO 在列治文鄰近 YVR 的車房檢查及維修煞車：煞車片、煞車碟、卡鉗、煞車油和煞車警示燈。大部分 2015–2020 年車款更換前煞車片，連零件 185–444 加元。工時費按行業標準工時收費。如煞車感覺不安全或突然有變，請在安全時停車並安排拖車。",
    symptoms: [
      "踩煞車時有尖叫、磨擦或刮擦聲",
      "煞車時方向盤或腳踏震動",
      "煞車腳踏變軟、變低、變硬或感覺不同",
      "煞車或 ABS 警示燈亮起",
    ],
    inspections: [
      "煞車片厚度、煞車碟狀況、卡鉗及配件",
      "煞車油狀態和滲漏",
      "警示燈，以及在合適情況下重現的症狀",
    ],
    safetyBody: "煞車問題直接影響車輛控制。不要憑網頁內容判斷能否駕駛；有需要時請安排拖車或道路救援。",
    process: [
      "說明異響、腳踏感覺、警示燈和出現的時候",
      "駕車或拖車到車房做煞車檢查",
      "看過量度結果、可選方案和報價後再批准維修",
    ],
    pricingBody: "煞車工時按您車款的標準工時收費，零件按 WorldPac 標價。大部分報價會列出兩至三款不同價位的煞車片或煞車碟供您選擇。",
    pricingRows: [
      {
        job: "更換前煞車片",
        laborTime: "0.8–1.1 小時",
        total: "$185–$444",
        examples: "2018 Toyota Corolla：$185–$227 · 2018 Honda Civic：$216–$311 · 2019 Toyota Camry：$262–$350",
      },
      {
        job: "更換後煞車片",
        laborTime: "0.9–1.1 小時",
        total: "$204–$356",
        examples: "2019 Toyota Camry：$204–$290 · 2018 Mercedes-Benz C300：$292–$356",
      },
      {
        job: "更換前煞車碟",
        laborTime: "0.7 小時",
        total: "$329–$403",
        examples: "2020 Toyota RAV4 LE：$329–$403",
      },
      {
        job: "更換後煞車碟",
        laborTime: "0.8 小時",
        total: "$398–$486",
        examples: "2020 Toyota RAV4 LE：$398–$486",
      },
      {
        job: "煞車油排氣 / 更換",
        laborTime: "0.9 小時",
        total: "$106–$215",
        examples: "2017 Honda CR-V：$106–$215",
      },
      {
        job: "更換煞車總泵",
        laborTime: "1.6 小時",
        total: "$962–$1,176",
        examples: "2017 Honda CR-V：$962–$1,176",
      },
    ],
    faqs: [
      {
        question: "換前煞車片要多少錢？",
        answer:
          "大部分 2015–2020 年車款連零件和工時 185–444 加元。例如 2018 Toyota Corolla 185–227 加元，2019 Toyota Camry 262–350 加元。您車輛的報價會列出具體的煞車片選項。",
      },
      {
        question: "換煞車片一定要換煞車碟嗎？",
        answer: "不一定。我們會量度煞車碟，檢查有沒有坑紋或震動，再告訴您能否繼續使用。",
      },
      {
        question: "煞車有異響就是煞車片磨光了嗎？",
        answer: "不一定。異響有多種原因，我們會先檢查煞車系統再選零件。",
      },
      {
        question: "煞車警示燈亮了還可以駕駛嗎？",
        answer: "警示燈需要檢查。如煞車感覺有變或不安全，請在安全時停車並尋求協助。",
      },
      {
        question: "煞車工時怎樣計算？",
        answer: "按您車款的標準工時收費。例如 2019 Toyota Camry LE 換前煞車片標準工時 1.1 小時。",
      },
      {
        question: "換零件前會先報價嗎？",
        answer: "會。您會先看到檢查結果、零件選項和總價，同意後才開工。",
      },
    ],
    ctaBody: "告訴我們煞車症狀、警示燈和車款，預約檢查。",
  },
  diagnostics: {
    metaTitle: "列治文引擎故障燈檢查及汽車電路維修",
    metaDescription:
      "列治文車房引擎故障燈、電池、發電機、摩打、感應器檢查及維修，鄰近 YVR。附真實報價實例；工時費按標準工時收費。",
    eyebrow: "故障診斷及電路",
    title: "引擎故障燈、電池及電路診斷",
    serviceType: "汽車故障診斷",
    summary:
      "SPEEDX AUTO 在列治文鄰近 YVR 的車房診斷引擎故障燈、各種警示燈、怠速不穩、無法啟動，以及電池和充電系統問題。故障碼只指向某個系統，不等於某個零件壞了，所以我們會先測試才換件。維修按標準工時收費，零件來自 WorldPac，按標價報價。",
    symptoms: [
      "引擎故障燈或其他警示燈長亮或反覆出現",
      "啟動乏力、電池無電，或行車時電池燈亮",
      "怠速震、加速遲緩、失去動力或耗油增加",
      "間歇性死火、無法啟動或電路故障",
    ],
    inspections: [
      "已儲存及待定的故障碼",
      "電池、充電和啟動系統測試",
      "實時數據、線路、插頭和相關部件",
    ],
    safetyBody: "引擎故障燈閃爍、水溫過高、機油壓力警告、冒煙或有明顯汽油味時，可能需要停止駕駛。如繼續駕駛有危險，請召道路救援。",
    process: [
      "傳送警示燈、症狀和出現的時候",
      "掃描及測試相關系統，不只憑故障碼換件",
      "看過診斷結果、是否需要進一步測試和維修方案後再批准",
    ],
    pricingBody: "找到原因後，維修按標準工時收費，另加零件費。以下是常見電路及引擎維修的真實報價。",
    pricingRows: [
      {
        job: "更換 12V 電池",
        laborTime: "0.3–0.7 小時",
        total: "$244–$634",
        examples: "2016 Mazda3：$258–$466 · 2017 Honda CR-V：$334–$430 · 2019 Toyota Camry：$266–$634",
      },
      {
        job: "更換發電機",
        laborTime: "0.8–3.6 小時",
        total: "$675–$1,866",
        examples: "2020 Toyota RAV4：$675–$988 · 2016 Toyota Highlander：$707–$1,002",
      },
      {
        job: "更換摩打（啟動馬達）",
        laborTime: "1.4 小時",
        total: "$683–$901",
        examples: "2015 Nissan Altima：$683–$901",
      },
      {
        job: "更換含氧感應器",
        laborTime: "0.5–1.0 小時",
        total: "$405–$626",
        examples: "2016 Honda Civic：$405–$611 · 2018 Toyota Camry（前含氧）：$512–$626",
      },
      {
        job: "更換節溫器",
        laborTime: "1.6–2.4 小時",
        total: "$215–$391",
        examples: "2018 Toyota Camry：$215–$336 · 2016 Toyota Highlander：$302–$391",
      },
    ],
    faqs: [
      {
        question: "故障碼可以直接告訴你換哪個零件嗎？",
        answer: "通常不可以。故障碼指向某個系統或狀況，要透過測試找出真正原因。",
      },
      {
        question: "換汽車電池要多少錢？",
        answer: "按我們報過價的車款，連電池及安裝 244–634 加元，視乎您車輛需要的電池規格和類型。",
      },
      {
        question: "怎樣知道是電池壞還是發電機壞？",
        answer: "電池經常無電，兩者都有可能。我們會測試電池、充電輸出和摩打，只換真正壞了的部件。",
      },
      {
        question: "間歇性故障查得出嗎？",
        answer: "大多可以，但可能需要更多時間或反覆測試。記下故障出現的情況會很有幫助。",
      },
      {
        question: "引擎故障燈閃爍還可以駕駛嗎？",
        answer: "閃爍可能表示嚴重故障正在發生。請在安全時停車並尋求專業意見。",
      },
      {
        question: "網上估價助手可以幫我看故障燈嗎？",
        answer: "它可以列出可能原因，並估算常見維修的價錢，但故障燈需要到車房掃描和測試，才能確認要修甚麼。",
      },
    ],
    ctaBody: "傳送警示燈、症狀和車款，我們安排診斷。",
  },
  suspension: {
    metaTitle: "列治文避震及轉向維修",
    metaDescription:
      "列治文車房避震器、平衡桿連桿、輪軸承、半軸維修，鄰近 YVR。附真實報價實例；工時費按標準工時收費。",
    eyebrow: "避震及轉向",
    title: "避震及轉向維修",
    serviceType: "避震及轉向維修",
    summary:
      "SPEEDX AUTO 在列治文鄰近 YVR 的車房檢查及維修過坑異響、鬆動、走偏、震動和輪胎偏磨，包括避震器、平衡桿連桿、輪軸承和半軸。相似症狀可能來自不同零件，所以我們先檢查。工時費按行業標準工時收費，零件來自 WorldPac，按標價報價。",
    symptoms: [
      "過減速壆或坑窿時有咯咯、咚咚或吱吱聲",
      "車輛走偏、發飄，需要不停修正方向",
      "方向盤變重、變鬆或手感不對",
      "輪胎偏磨、輪軸承有嗡嗡聲，或高速時震動",
    ],
    inspections: [
      "避震器、避震頂膠、襯套和轉向球頭",
      "輪軸承、半軸及防塵套",
      "輪胎磨損情況，以及試車或車房內重現的症狀",
    ],
    safetyBody: "轉向及避震故障會影響車輛穩定。突然鬆動、嚴重震動或方向失靈時請格外小心，可能需要拖車。",
    process: [
      "說明異響或操控變化，以及出現的時候",
      "檢查輪胎、轉向、避震和傳動部件",
      "看過檢查結果和報價後再批准維修",
    ],
    pricingBody: "避震工時按您車款的標準工時收費，零件按 WorldPac 標價。",
    pricingRows: [
      {
        job: "更換前避震器總成",
        laborTime: "1.9–2.4 小時",
        total: "$446–$873",
        examples: "2019 Subaru Outback：$446–$734 · 2015 Honda Accord：$500–$873",
      },
      {
        job: "更換後避震器總成",
        laborTime: "1.6 小時",
        total: "$467–$641",
        examples: "2015 Honda Accord：$467–$641",
      },
      {
        job: "更換前避震頂膠",
        laborTime: "3.4 小時",
        total: "$582–$712",
        examples: "2015 Honda Accord：$582–$712",
      },
      {
        job: "更換前平衡桿連桿",
        laborTime: "0.4 小時",
        total: "$187–$257",
        examples: "2015 Honda Accord：$187–$257",
      },
      {
        job: "更換前半軸",
        laborTime: "2.2 小時",
        total: "$863–$1,851",
        examples: "2016 Toyota RAV4：$863–$1,851",
      },
      {
        job: "更換前輪軸承",
        laborTime: "1.2 小時",
        total: "工時 $130–$158 + 零件",
        examples: "2020 Kia Sorento",
      },
    ],
    faqs: [
      {
        question: "換前避震器要多少錢？",
        answer: "按我們報過價的車款，連零件和工時 446–873 加元，例如 2019 Subaru Outback 446–734 加元，2015 Honda Accord 500–873 加元。",
      },
      {
        question: "過坑有咯咯聲是甚麼問題？",
        answer: "常見原因有平衡桿連桿、避震頂膠、襯套老化或避震器損壞。平衡桿連桿是較便宜的一種，2015 Honda Accord 約 187–257 加元。",
      },
      {
        question: "走偏一定要做四輪定位嗎？",
        answer: "不一定。輪胎、煞車、轉向和避震部件都可能導致走偏，所以我們先檢查。",
      },
      {
        question: "避震磨損會令輪胎偏磨嗎？",
        answer: "會。我們會把輪胎、轉向和避震一併檢查。",
      },
      {
        question: "隨車速變化的嗡嗡聲是輪軸承壞了嗎？",
        answer: "很多時是，但輪胎也可能發出類似聲音。我們會先檢查軸承和輪胎再建議維修。",
      },
      {
        question: "有咯咯聲可以不理嗎？",
        answer: "單憑聲音無法判斷。請預約檢查，尤其是方向或操控已經有變化時。",
      },
    ],
    ctaBody: "告訴我們異響、震動或方向變化出現的時候，我們安排檢查。",
  },
  "tesla-ev": {
    metaTitle: "列治文 Tesla 維修 · 電動車維修",
    metaDescription:
      "列治文獨立 Tesla 及電動車維修，鄰近 YVR：高壓電池檢測、電動馬達維修、故障碼診斷、煞車、避震、輪胎。工時費按標準工時收費。粵語、普通話、英語服務。",
    eyebrow: "Tesla 及電動車",
    title: "Tesla 及電動車維修",
    serviceType: "電動車維修",
    summary:
      "SPEEDX AUTO 在列治文 2980 Number 3 Road、鄰近 YVR 的車房維修電動車，以 Tesla 為主。我們提供高壓電池檢測、電動馬達維修、故障碼讀取及診斷，以及電動車的煞車、避震、輪胎和保養。工時費按行業標準工時收費。須預約，店內可說粵語、普通話及英語。",
    symptoms: [
      "屏幕出現電池或驅動系統警告，或重新啟動後警告仍在",
      "續航或動力無故下降",
      "加速或減速時電動馬達有尖嘯、磨擦或咯咯聲",
      "煞車異響、避震異響，或輪胎磨損得很快",
    ],
    inspections: ["故障碼及警告紀錄", "高壓電池狀況", "電動馬達的異響、滲漏和支架", "煞車、卡鉗、避震和輪胎"],
    safetyBody:
      "切勿自行打開或處理高壓部件，橙色電線帶有危險電壓。如車輛提示電池故障、冒煙或有燒焦味，請把車停在遠離建築物的地方，所有人下車，並致電 911。",
    process: [
      "傳送車款、年份、里程和屏幕警告的相片",
      "約好時間，把車駛到列治文車房",
      "看過診斷結果、方案和報價後再批准維修",
    ],
    pricingBody: "電動車的維修和診斷同樣按標準工時收費，零件於開工前報價。換胎和冷氣加雪種按車房一口價。",
    pricingRows: [
      {
        job: "維修及診斷",
        laborTime: "標準工時",
        total: "標準工時 + 零件",
        examples: "開工前報價",
      },
      {
        job: "換胎（每條）",
        laborTime: "一口價",
        total: "$25–$35",
        examples: "18 吋或以下 $25 · 18 吋以上 $30 · 防爆胎 $35；輪胎另計",
      },
      {
        job: "冷氣加雪種（冷媒）",
        laborTime: "一口價",
        total: "$150 或 $230",
        examples: "R-134a $150 · R-1234yf $230，以標籤為準",
      },
    ],
    pricingFootnote: "以上為未連稅價錢。零件按 WorldPac 標價，開工前報價。",
    faqs: [
      {
        question: "可以維修 Tesla 嗎？",
        answer: "可以。我們的電動車業務以 Tesla 為主：高壓電池檢測、電動馬達維修、故障碼診斷，以及煞車、避震、輪胎和保養。",
      },
      {
        question: "可以檢測 Tesla 的高壓電池嗎？",
        answer: "可以。我們檢查電池狀況和相關故障碼，維修前先向您說明結果和可選方案。",
      },
      {
        question: "電動車還需要保養嗎？",
        answer:
          "需要。輪胎、煞車、冷氣濾網、冷氣系統和 12V 小電池都需要定期照顧。動能回收令煞車片用得少，在溫哥華這種潮濕天氣下，卡鉗反而容易卡死或生鏽。請參照車主手冊的保養周期。",
      },
      {
        question: "維修 Tesla 大概要多少錢？",
        answer: "工時費按標準工時計算，另加零件費，開工前給您報價。換胎每條 25 加元起，冷氣加雪種 150 或 230 加元。",
      },
      {
        question: "其他品牌的電動車可以維修嗎？",
        answer: "部分可以。請先傳送品牌、車款和問題，我們確認能否承接。",
      },
      {
        question: "需要預約嗎？",
        answer: "需要。請透過 WhatsApp、電話或微信預約。",
      },
    ],
    ctaBody: "傳送 Tesla 的車款、年份和屏幕警告相片，預約診斷。",
  },
};

export const zhTWRepairServices = withLabels(zhTWLabels, zhTWSeeds);
