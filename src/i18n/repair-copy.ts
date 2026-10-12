import type {
  AutoRepairCopy,
  LocalizedFaqItem,
  RepairServiceCopy,
} from "@/i18n/types";

interface ServiceLabels {
  symptomsTitle: string;
  inspectionsTitle: string;
  safetyTitle: string;
  processTitle: string;
  serviceAreaTitle: string;
  serviceAreaBody: string;
  faqTitle: string;
  ctaTitle: string;
  lastUpdated: string;
}

interface ServiceSeed {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  summary: string;
  symptoms: string[];
  inspections: string[];
  safetyBody: string;
  process: string[];
  faqs: LocalizedFaqItem[];
  ctaBody: string;
}

function service(labels: ServiceLabels, seed: ServiceSeed): RepairServiceCopy {
  return { ...labels, ...seed };
}

const enLabels: ServiceLabels = {
  symptomsTitle: "When to book an inspection",
  inspectionsTitle: "What we inspect",
  safetyTitle: "Safety and diagnosis",
  processTitle: "What happens next",
  serviceAreaTitle: "Repair service area",
  serviceAreaBody:
    "SPEEDX AUTO provides mechanical repair in Richmond near YVR for customers across Metro Vancouver. Contact us before travelling to confirm scheduling and vehicle fit.",
  faqTitle: "Frequently asked questions",
  ctaTitle: "Ask SPEEDX AUTO about your vehicle",
  lastUpdated: "Updated August 11, 2026",
};

export const enAutoRepair: AutoRepairCopy = {
  metaTitle: "Auto Repair & Tesla Service in Richmond, BC",
  metaDescription:
    "Richmond auto repair near YVR: maintenance, brakes, diagnostics, suspension and Tesla/EV service. $120/hr labor billed by industry-standard times. English, Cantonese, Mandarin.",
  eyebrow: "Auto repair · Richmond, BC",
  title: "Auto Repair & EV Service in Richmond, BC",
  summary:
    "SPEEDX AUTO is an auto repair shop at 2980 Number 3 Road in Richmond, BC, near YVR. We handle maintenance, brakes, diagnostics, suspension, and electric vehicles, mainly Tesla. Labor is $120 per hour, billed by industry-standard labor-guide times, and parts come from WorldPac at list price. We speak English, Cantonese, and Mandarin. Appointments are required.",
  serviceName: "Auto repair and maintenance",
  serviceType: "Auto repair",
  facts: {
    title: "At a glance",
    items: [
      { label: "Labor rate", value: "$120 per hour, before tax" },
      { label: "Labor time", value: "Industry-standard labor-guide times (ALLDATA), not a stopwatch" },
      { label: "Parts", value: "WorldPac parts, quoted at list price" },
      { label: "Electric vehicles", value: "Mainly Tesla: battery checks, drive motor repair, fault codes" },
      { label: "Languages", value: "English, Cantonese, Mandarin" },
      { label: "Payment", value: "Cash, credit card, WeChat Pay" },
      { label: "Appointments", value: "Required. Book by WhatsApp, phone, or WeChat" },
      { label: "Online estimate", value: "AI estimate assistant on this page" },
    ],
    hoursLabel: "Hours",
    addressLabel: "Address",
  },
  pricing: {
    title: "What repairs cost",
    intro:
      "Every quote is labor plus parts. You see the labor hours, the hourly rate, and the parts options before any work starts.",
    laborRateLabel: "Labor rate",
    laborTitle: "How labor is calculated",
    laborBody:
      "Labor is $120 per hour, multiplied by the time an industry-standard labor guide sets for that job on your exact vehicle. Our shop system is ALLDATA. The guide sets the hours, not a clock running in the bay. For example, front brake pads on a 2019 Toyota Camry LE are rated at 1.1 hours, so labor is $132.",
    columns: {
      job: "Job",
      laborTime: "Labor-guide time",
      total: "Total range",
      examples: "Examples",
    },
    rows: [
      {
        job: "Front brake pads",
        laborTime: "0.8–1.1 h",
        total: "$205–$405",
        examples: "2018 Toyota Corolla: $206 · 2019 Toyota Camry: $291–$318",
      },
      {
        job: "Rear brake pads",
        laborTime: "0.9–1.1 h",
        total: "$225–$325",
        examples: "2018 Honda Civic: $240–$275 · 2018 Mercedes-Benz C300: $324",
      },
      {
        job: "12-volt battery",
        laborTime: "0.3–0.7 h",
        total: "$270–$580",
        examples: "2016 Mazda3: $287–$424 · 2017 Honda CR-V: $371–$391",
      },
      {
        job: "Front strut assemblies",
        laborTime: "1.9–2.4 h",
        total: "$495–$795",
        examples: "2019 Subaru Outback: $496–$667 · 2015 Honda Accord: $555–$794",
      },
      {
        job: "Alternator",
        laborTime: "0.8–3.6 h",
        total: "$750–$1,700",
        examples: "2020 Toyota RAV4: $750–$898 · 2016 Toyota Highlander: $786–$911",
      },
      {
        job: "Engine thermostat",
        laborTime: "1.6–2.4 h",
        total: "$235–$355",
        examples: "2018 Toyota Camry: $239–$305 · 2016 Toyota Highlander: $336–$355",
      },
      {
        job: "Oil and filter change",
        laborTime: "0.5 h",
        total: "$60 labor + oil and filter",
        examples: "Oil is priced by the litre for your engine",
      },
      {
        job: "Cabin air filter",
        laborTime: "0.3 h",
        total: "About $85",
        examples: "2017 Honda CR-V: $85–$86",
      },
    ],
    footnote:
      "Totals are parts plus labor, before tax. They come from real estimates our estimate assistant produced on October 11–12, 2026, using WorldPac list prices and labor-guide times for 2015–2020 Toyota, Honda, Mazda, Nissan, Subaru, Volkswagen, and Mercedes-Benz models. Your price depends on the exact vehicle and the parts you choose, and inspection may find other work. We confirm the quote with you before starting.",
  },
  scope: {
    title: "What we work on",
    offeredTitle: "Mechanical repair and maintenance",
    offered: [
      "Scheduled maintenance and oil changes",
      "Brake pads, rotors, calipers, and brake fluid",
      "Check-engine light and electrical diagnostics",
      "Suspension and steering",
      "Batteries, alternators, and starters",
      "Cooling system and thermostats",
      "Tesla and EV battery checks, drive motor repair, and fault codes",
    ],
    quoteTitle: "Body work and paint: quoted case by case",
    quoteBody:
      "We do body and paint work, but it is quoted individually. Send photos of the damage by WhatsApp or WeChat and the team will reply with a quote.",
    notOfferedTitle: "Not offered",
    notOfferedBody: "We don't repair or rebuild transmissions.",
  },
  ev: {
    title: "Tesla and electric vehicle service",
    body:
      "We service electric vehicles, mainly Tesla. Labor is billed at the same $120 per hour, using labor-guide times.",
    items: [
      "High-voltage battery checks",
      "Drive motor repair",
      "Fault-code reading and diagnosis",
      "Brakes, suspension, and routine maintenance on EVs",
    ],
    note: "For other EV brands, send the model and the problem first and we will confirm whether we can take the job.",
  },
  servicesTitle: "Service guides",
  servicesIntro:
    "Each guide covers symptoms, what we inspect, and when to stop driving. A physical inspection sets the final recommendation and quote.",
  whyTitle: "Why drivers choose SPEEDX AUTO",
  whyItems: [
    {
      title: "Labor-guide pricing",
      body: "Labor hours come from an industry-standard guide for your vehicle, so the time on your bill is the published time for the job.",
    },
    {
      title: "Parts at list price",
      body: "Parts come from WorldPac and are quoted at list price, with a choice of brands where more than one fits.",
    },
    {
      title: "Three languages",
      body: "Talk to the shop in English, Cantonese, or Mandarin, by phone, WhatsApp, or WeChat.",
    },
    {
      title: "Fleet experience",
      body: "The same shop maintains the 100+ vehicles in SPEEDX AUTO's rental fleet.",
    },
  ],
  serviceAreaTitle: "Richmond and Metro Vancouver",
  serviceAreaBody:
    "Our shop is at 2980 Number 3 Road in Richmond near YVR, and serves drivers from Richmond and across Metro Vancouver. Book an appointment before you come in.",
  serviceAreaPlaces: ["Richmond", "Vancouver", "Burnaby", "Delta", "Surrey", "New Westminster"],
  faqTitle: "Auto repair questions",
  faqs: [
    {
      question: "How much does a repair cost at SPEEDX AUTO?",
      answer:
        "Labor is $120 per hour times the labor-guide time for the job, plus parts at WorldPac list price. Front brake pads on most 2015–2020 cars came to $205–$405 including parts. You get the full quote before any work starts.",
    },
    {
      question: "How do you decide how many labor hours to charge?",
      answer:
        "We use the time an industry-standard labor guide publishes for that job on your vehicle (our shop system is ALLDATA). The hours are not set by a stopwatch or a guess.",
    },
    {
      question: "Can I get an estimate online?",
      answer:
        "Yes. Open the estimate assistant on this page with your name and phone number, then describe the vehicle and the problem. It suggests likely causes and builds a ballpark price from our labor rate, labor-guide times, and current parts list prices. The final quote follows an inspection.",
    },
    {
      question: "Do you repair Teslas and other electric vehicles?",
      answer:
        "Yes, mainly Tesla. We do high-voltage battery checks, drive motor repair, fault-code diagnosis, and routine work such as brakes and suspension. For other EV brands, contact us first to confirm.",
    },
    {
      question: "Do I need an appointment?",
      answer: "Yes. Book by WhatsApp, phone, or WeChat so the team can confirm the time and the work.",
    },
    {
      question: "What languages does the shop speak?",
      answer: "English, Cantonese, and Mandarin.",
    },
    {
      question: "How can I pay?",
      answer: "Cash, credit card, or WeChat Pay.",
    },
    {
      question: "Do you do body work and paint?",
      answer:
        "Yes, quoted case by case. Send photos of the damage by WhatsApp or WeChat and the team will reply with a quote.",
    },
    {
      question: "Do you repair transmissions?",
      answer: "No. We don't repair or rebuild transmissions.",
    },
    {
      question: "Where do your parts come from?",
      answer:
        "From WorldPac, quoted at list price. Where several brands fit your vehicle, the estimate shows the options so you can choose.",
    },
    {
      question: "What information should I send?",
      answer:
        "Send the year, make, model, mileage, warning lights, symptoms, and when the issue occurs. Photos or a short video help. A final diagnosis requires checking the vehicle.",
    },
    {
      question: "Where is the shop?",
      answer:
        "2980 Number 3 Road, Richmond, BC V6X 2B3, near Vancouver International Airport. Hours are Monday to Saturday, 10:00 AM to 6:30 PM; closed Sunday.",
    },
  ],
  ctaTitle: "Book your repair",
  ctaBody:
    "Send the vehicle details and the problem by WhatsApp or WeChat, or call SPEEDX AUTO to book an appointment.",
  lastUpdated: "Updated October 12, 2026",
  services: {
    maintenance: service(enLabels, {
      metaTitle: "Vehicle Maintenance and Inspection in Richmond",
      metaDescription:
        "Scheduled maintenance and vehicle inspection near YVR for Richmond and Metro Vancouver drivers.",
      eyebrow: "Maintenance and inspection",
      title: "Vehicle Maintenance and Inspection",
      summary:
        "SPEEDX AUTO provides scheduled vehicle maintenance and inspection at our Richmond shop near YVR. We review the vehicle's condition, mileage, warning indicators, and manufacturer-related service needs before recommending work. Bring the year, make, model, mileage, and available service history so the inspection can start with accurate information rather than assumptions.",
      symptoms: [
        "A scheduled service interval or dashboard maintenance reminder is due",
        "Fluids, filters, tires, or general condition need review",
        "You purchased a used vehicle and want a mechanical starting point",
      ],
      inspections: [
        "Visible fluid condition and signs of leakage",
        "Tires, brakes, lights, wipers, and common wear items",
        "Dashboard indicators and maintenance needs relevant to the vehicle",
      ],
      safetyBody:
        "Maintenance needs vary by vehicle, mileage, use, and prior work. We inspect first and explain the recommended scope before repairs are authorized.",
      process: [
        "Send vehicle details, mileage, and available service history",
        "Book an inspection time with the Richmond shop",
        "Review findings and authorize only the work you choose",
      ],
      faqs: [
        {
          question: "Do you follow the same schedule for every vehicle?",
          answer: "No. The starting point depends on the vehicle, mileage, use, and available history.",
        },
        {
          question: "Can you inspect a recently purchased used vehicle?",
          answer: "Contact us with the vehicle details and the type of inspection you need so we can confirm scope.",
        },
        {
          question: "Will I receive a quote before work proceeds?",
          answer: "The team reviews inspection findings and the proposed work before you authorize repairs.",
        },
      ],
      ctaBody: "Send your vehicle, mileage, and maintenance concern to arrange the appropriate inspection.",
    }),
    brakes: service(enLabels, {
      metaTitle: "Brake Inspection and Repair in Richmond",
      metaDescription:
        "Brake noise, vibration and warning-light inspection near YVR for Metro Vancouver drivers.",
      eyebrow: "Brake service",
      title: "Brake Inspection and Repair",
      summary:
        "SPEEDX AUTO inspects brake noise, vibration, pedal changes, warning lights, and visible wear at our Richmond shop near YVR. Because several components can create similar symptoms, we check the vehicle before recommending parts or repair. If braking feels unsafe or changes suddenly, stop driving when safe and arrange professional assistance.",
      symptoms: [
        "Squealing, grinding, scraping, or repeated brake noise",
        "Steering-wheel or pedal vibration while braking",
        "A soft, hard, low, or changing brake pedal",
        "Brake or ABS warning indicators",
      ],
      inspections: [
        "Accessible pads, rotors, calipers, and related hardware",
        "Brake fluid condition and visible leaks",
        "Warning indicators and symptoms reproduced during an appropriate check",
      ],
      safetyBody:
        "Braking problems can affect vehicle control. Do not rely on a web description to decide whether a vehicle is safe to drive; arrange towing or roadside help when necessary.",
      process: [
        "Describe the noise, pedal feel, warning lights, and when symptoms occur",
        "Bring or transport the vehicle for a brake inspection",
        "Review measured findings, repair options, and the quote before authorization",
      ],
      faqs: [
        {
          question: "Does brake noise always mean the pads are worn out?",
          answer: "No. Noise can have several causes, so the brake system should be inspected before parts are selected.",
        },
        {
          question: "Can I keep driving with a brake warning light?",
          answer: "A warning light requires proper assessment. If braking changes or feels unsafe, stop driving when safe and seek assistance.",
        },
        {
          question: "Do you quote brake work before replacing parts?",
          answer: "Inspection findings determine the proposed repair and quote, which are reviewed before authorization.",
        },
      ],
      ctaBody: "Tell us the brake symptom, warning lights, and vehicle details so we can arrange the right inspection.",
    }),
    diagnostics: service(enLabels, {
      metaTitle: "Check Engine Light and Vehicle Diagnostics in Richmond",
      metaDescription:
        "Warning-light and drivability diagnostics near YVR for Richmond and Metro Vancouver vehicles.",
      eyebrow: "Vehicle diagnostics",
      title: "Check-Engine and Vehicle Diagnostics",
      summary:
        "SPEEDX AUTO investigates check-engine lights, warning indicators, rough running, starting problems, and other drivability concerns at our Richmond shop near YVR. A fault code identifies a system or condition, not automatically the failed part. We combine scan information with inspection and testing before explaining likely causes and recommended next steps.",
      symptoms: [
        "Check-engine or other warning light remains on or returns",
        "Rough idle, hesitation, reduced power, or unusual fuel use",
        "Intermittent starting, stalling, or electrical behaviour",
      ],
      inspections: [
        "Stored and pending diagnostic trouble codes",
        "Relevant live data, visible wiring, connections, and system condition",
        "Targeted tests selected from the symptoms and initial findings",
      ],
      safetyBody:
        "A flashing warning light, overheating, oil-pressure warning, severe loss of power, smoke, or strong fuel smell may require stopping the vehicle. Seek roadside help when continued driving could be unsafe.",
      process: [
        "Send the warning lights, symptoms, and conditions when they appear",
        "Scan and inspect the related systems rather than replacing parts from a code alone",
        "Review findings, further test needs, and repair options before authorization",
      ],
      faqs: [
        {
          question: "Does a code tell you exactly which part to replace?",
          answer: "Usually not. A code points to a system or detected condition and must be interpreted with testing.",
        },
        {
          question: "Can you diagnose an intermittent problem?",
          answer: "Intermittent faults can require additional time or repeat testing. Details about when the symptom occurs are valuable.",
        },
        {
          question: "Should I drive with a flashing check-engine light?",
          answer: "A flashing light can indicate a serious active fault. Reduce risk, stop when safe, and arrange professional advice.",
        },
      ],
      ctaBody: "Send the warning light, symptoms, and vehicle details so we can choose the correct diagnostic starting point.",
    }),
    suspension: service(enLabels, {
      metaTitle: "Suspension and Steering Inspection in Richmond",
      metaDescription:
        "Suspension, steering, vibration and uneven-tire-wear inspection near YVR for Metro Vancouver drivers.",
      eyebrow: "Suspension and steering",
      title: "Suspension and Steering Inspection",
      summary:
        "SPEEDX AUTO inspects clunks, looseness, pulling, steering changes, vibration, and uneven tire wear at our Richmond shop near YVR. Similar symptoms may come from tires, alignment, steering, suspension, wheel bearings, or other components. We inspect the vehicle first, then explain the findings and any recommended repair or further testing.",
      symptoms: [
        "Clunks, knocks, squeaks, or looseness over bumps",
        "Vehicle pulling, wandering, or requiring frequent correction",
        "Steering effort or feel has changed",
        "Uneven tire wear or vibration at particular speeds",
      ],
      inspections: [
        "Accessible steering and suspension joints, bushings, and mounts",
        "Tire condition, wear pattern, wheels, and related visible components",
        "Symptoms during a suitable road or shop inspection",
      ],
      safetyBody:
        "Steering or suspension faults can affect stability and control. Sudden looseness, severe vibration, or loss of steering response requires immediate caution and may require towing.",
      process: [
        "Describe the sound or handling change and when it occurs",
        "Inspect the tires, steering, suspension, and related components",
        "Review findings and authorize the proposed work after receiving the quote",
      ],
      faqs: [
        {
          question: "Does pulling always mean the vehicle needs an alignment?",
          answer: "No. Tire, brake, steering, suspension, and road conditions can also contribute, so inspection comes first.",
        },
        {
          question: "Can worn suspension cause uneven tire wear?",
          answer: "It can contribute, but the tire and related steering or alignment conditions should be assessed together.",
        },
        {
          question: "Is a clunk safe to ignore?",
          answer: "A sound alone cannot establish safety. Arrange an inspection, especially if handling or steering has changed.",
        },
      ],
      ctaBody: "Tell us when the noise, vibration, or steering change occurs so we can plan the inspection.",
    }),
  },
};

const zhCNLabels: ServiceLabels = {
  symptomsTitle: "什么时候应该预约检查",
  inspectionsTitle: "我们会检查什么",
  safetyTitle: "安全与诊断说明",
  processTitle: "接下来的流程",
  serviceAreaTitle: "维修服务区域",
  serviceAreaBody:
    "SPEEDX AUTO 的机械维修车间位于列治文、靠近 YVR，为列治文及大温地区的客人服务。到店前请先联系我们确认时间与车辆需求。",
  faqTitle: "常见问题",
  ctaTitle: "向 SPEEDX AUTO 说明车辆情况",
  lastUpdated: "更新于 2026 年 8 月 11 日",
};

export const zhCNAutoRepair: AutoRepairCopy = {
  metaTitle: "列治文汽车维修 · 特斯拉电动车维修",
  metaDescription:
    "列治文修车厂，靠近温哥华机场：保养、刹车、故障诊断、悬挂转向、特斯拉电动车维修。工时费每小时 $120，按行业标准工时计费。普通话、粤语、英语服务。",
  eyebrow: "汽车维修 · 列治文",
  title: "列治文汽车维修与电动车维修",
  summary:
    "SPEEDX AUTO 速驰汽车是位于列治文 2980 Number 3 Road 的修车厂，靠近温哥华国际机场（YVR）。我们做常规保养、刹车、故障诊断、悬挂转向，也修电动车，以特斯拉为主。工时费每小时 120 加元，按行业标准工时计费；配件来自 WorldPac，按标价报价。店里讲普通话、粤语和英语，需提前预约。",
  serviceName: "汽车维修与保养",
  serviceType: "汽车维修",
  facts: {
    title: "基本信息",
    items: [
      { label: "工时费", value: "每小时 $120（税前）" },
      { label: "工时标准", value: "按行业标准工时手册（ALLDATA）计时，不按实际干活时间随意计算" },
      { label: "配件", value: "WorldPac 配件，按标价报价" },
      { label: "电动车", value: "以特斯拉为主：电池检测、电机维修、故障码检测" },
      { label: "服务语言", value: "普通话、粤语、英语" },
      { label: "付款方式", value: "现金、信用卡、微信支付" },
      { label: "预约", value: "需要预约，可通过 WhatsApp、电话或微信" },
      { label: "在线估价", value: "本页面的 AI 估价助手" },
    ],
    hoursLabel: "营业时间",
    addressLabel: "地址",
  },
  pricing: {
    title: "修车大概多少钱",
    intro: "每份报价都由工时费和配件费组成。开工前，您会看到工时数、每小时费率和可选配件。",
    laborRateLabel: "工时费",
    laborTitle: "工时费怎么算",
    laborBody:
      "工时费 = 每小时 120 加元 × 行业标准工时手册给这款车、这项工作规定的工时。店里使用的系统是 ALLDATA。工时由手册决定，不是看技师在车间里实际干了多久。例如 2019 款丰田凯美瑞 LE 换前刹车片，标准工时 1.1 小时，工时费就是 132 加元。",
    columns: {
      job: "项目",
      laborTime: "标准工时",
      total: "总价区间",
      examples: "实例",
    },
    rows: [
      {
        job: "换前刹车片",
        laborTime: "0.8–1.1 小时",
        total: "$205–$405",
        examples: "2018 丰田卡罗拉：$206 · 2019 丰田凯美瑞：$291–$318",
      },
      {
        job: "换后刹车片",
        laborTime: "0.9–1.1 小时",
        total: "$225–$325",
        examples: "2018 本田思域：$240–$275 · 2018 奔驰 C300：$324",
      },
      {
        job: "换 12V 电瓶",
        laborTime: "0.3–0.7 小时",
        total: "$270–$580",
        examples: "2016 马自达 3：$287–$424 · 2017 本田 CR-V：$371–$391",
      },
      {
        job: "换前减震器总成",
        laborTime: "1.9–2.4 小时",
        total: "$495–$795",
        examples: "2019 斯巴鲁傲虎：$496–$667 · 2015 本田雅阁：$555–$794",
      },
      {
        job: "换发电机",
        laborTime: "0.8–3.6 小时",
        total: "$750–$1,700",
        examples: "2020 丰田 RAV4：$750–$898 · 2016 丰田汉兰达：$786–$911",
      },
      {
        job: "换节温器",
        laborTime: "1.6–2.4 小时",
        total: "$235–$355",
        examples: "2018 丰田凯美瑞：$239–$305 · 2016 丰田汉兰达：$336–$355",
      },
      {
        job: "换机油机滤",
        laborTime: "0.5 小时",
        total: "工时 $60 + 机油和滤芯",
        examples: "机油按发动机所需升数计价",
      },
      {
        job: "换空调滤芯",
        laborTime: "0.3 小时",
        total: "约 $85",
        examples: "2017 本田 CR-V：$85–$86",
      },
    ],
    footnote:
      "以上为配件加工时的税前总价，取自 2026 年 10 月 11–12 日估价助手生成的真实报价，基于 WorldPac 标价和标准工时，车型为 2015–2020 年的丰田、本田、马自达、日产、斯巴鲁、大众和奔驰。实际价格取决于具体车型和所选配件，检查时也可能发现其他需要处理的问题。开工前我们会先和您确认报价。",
  },
  scope: {
    title: "维修范围",
    offeredTitle: "机械维修与保养",
    offered: [
      "定期保养、换机油",
      "刹车片、刹车盘、卡钳、刹车油",
      "发动机故障灯与电路诊断",
      "悬挂与转向",
      "电瓶、发电机、启动马达",
      "冷却系统与节温器",
      "特斯拉等电动车的电池检测、电机维修、故障码检测",
    ],
    quoteTitle: "钣金喷漆：单独报价",
    quoteBody: "钣金和喷漆可以做，需要单独报价。请通过 WhatsApp 或微信发送损伤照片，客服会回复报价。",
    notOfferedTitle: "不提供",
    notOfferedBody: "不做变速箱维修或大修。",
  },
  ev: {
    title: "特斯拉与电动车维修",
    body: "我们维修电动车，以特斯拉为主。工时费同样是每小时 120 加元，按标准工时计费。",
    items: ["高压电池检测", "驱动电机维修", "故障码读取与诊断", "电动车的刹车、悬挂和常规保养"],
    note: "其他品牌的电动车，请先发送车型和问题，我们确认能否承接。",
  },
  servicesTitle: "维修项目指南",
  servicesIntro: "每个指南介绍常见症状、检查内容，以及什么情况下应停止驾驶。最终建议与报价以实车检查为准。",
  whyTitle: "为什么选择 SPEEDX AUTO",
  whyItems: [
    { title: "按标准工时收费", body: "工时数来自行业标准工时手册，账单上的工时就是这项工作的规定工时。" },
    { title: "配件按标价", body: "配件来自 WorldPac，按标价报价；同一配件有多个品牌时，您可以自己选。" },
    { title: "三种语言沟通", body: "普通话、粤语、英语都可以，电话、WhatsApp、微信都能联系。" },
    { title: "车队维护经验", body: "SPEEDX AUTO 自营租车车队的 100 多辆车，也由这个车间维护。" },
  ],
  serviceAreaTitle: "列治文及大温地区",
  serviceAreaBody:
    "车间位于列治文 2980 Number 3 Road，靠近 YVR，服务列治文及大温各地车主。到店前请先预约。",
  serviceAreaPlaces: ["列治文", "温哥华", "本拿比", "三角洲", "素里", "新威斯敏斯特"],
  faqTitle: "汽车维修常见问题",
  faqs: [
    {
      question: "在 SPEEDX AUTO 修车大概多少钱？",
      answer:
        "工时费为每小时 120 加元乘以该项目的标准工时，再加上按 WorldPac 标价计算的配件费。大多数 2015–2020 年车型换前刹车片，含配件约 205–405 加元。开工前会给您完整报价。",
    },
    {
      question: "工时是怎么定的？",
      answer: "按行业标准工时手册给您这款车、这项工作规定的工时计算（店里使用 ALLDATA 系统），不是按秒表或凭感觉估。",
    },
    {
      question: "可以在网上先估价吗？",
      answer:
        "可以。在本页面填写姓名和电话打开估价助手，描述车辆和问题，它会给出可能的原因，并按我们的工时费、标准工时和当前配件标价算出参考价。最终报价以到店检查为准。",
    },
    {
      question: "能修特斯拉和其他电动车吗？",
      answer: "能，以特斯拉为主。可以做高压电池检测、驱动电机维修、故障码诊断，以及刹车、悬挂等常规项目。其他品牌电动车请先联系确认。",
    },
    { question: "需要预约吗？", answer: "需要。请通过 WhatsApp、电话或微信预约，确认时间和维修项目。" },
    { question: "店里讲什么语言？", answer: "普通话、粤语和英语。" },
    { question: "怎么付款？", answer: "现金、信用卡或微信支付。" },
    { question: "做钣金喷漆吗？", answer: "做，需要单独报价。请通过 WhatsApp 或微信发送损伤照片，客服会回复报价。" },
    { question: "修变速箱吗？", answer: "不修。我们不做变速箱维修或大修。" },
    { question: "配件从哪里来？", answer: "来自 WorldPac，按标价报价。同一配件有多个品牌适配时，估价单会列出选项供您选择。" },
    {
      question: "联系时应提供什么？",
      answer: "请提供年份、品牌、型号、里程、故障灯、症状及出现条件，照片或短视频也很有帮助。最终诊断需要检查实车。",
    },
    {
      question: "店在哪里？",
      answer: "2980 Number 3 Rd, Richmond, BC V6X 2B3，靠近温哥华国际机场。营业时间周一至周六 10:00 - 18:30，周日休息。",
    },
  ],
  ctaTitle: "预约维修",
  ctaBody: "通过 WhatsApp 或微信发送车辆资料和问题，或直接致电 SPEEDX AUTO 预约。",
  lastUpdated: "更新于 2026 年 10 月 12 日",
  services: {
    maintenance: service(zhCNLabels, {
      metaTitle: "列治文车辆保养与检查",
      metaDescription: "列治文 YVR 附近的定期保养与车辆检查服务。",
      eyebrow: "保养与检查",
      title: "车辆保养与检查",
      summary:
        "SPEEDX AUTO 在列治文 YVR 附近提供车辆定期保养与检查。我们会结合车辆状况、里程、仪表提示及相关保养需求，再建议需要进行的工作。请提供年份、品牌、型号、里程和现有保养记录，让检查从准确资料开始，而不是按统一套餐推测。",
      symptoms: ["保养周期或仪表保养提示已到", "需要检查油液、滤芯、轮胎或整体车况", "刚购买二手车，希望建立机械状况基准"],
      inspections: ["可见油液状态与泄漏痕迹", "轮胎、刹车、灯光、雨刷和常见磨损件", "与该车辆相关的仪表提示和保养需求"],
      safetyBody: "保养需求取决于车型、里程、用途与既往记录。我们先检查，再说明建议范围，获得授权后才进行工作。",
      process: ["发送车辆、里程和保养记录", "预约列治文车间检查时间", "查看结果并自行决定授权哪些工作"],
      faqs: [
        { question: "所有车辆都按同一周期保养吗？", answer: "不是，车型、里程、用途和既往记录都会影响检查起点。" },
        { question: "可以检查刚买的二手车吗？", answer: "可以先联系我们说明车辆资料和希望检查的范围，由团队确认安排。" },
        { question: "施工前会先说明报价吗？", answer: "团队会先说明检查发现和建议工作，再由您决定是否授权。" },
      ],
      ctaBody: "发送车辆资料、里程和保养需求，安排合适的检查。",
    }),
    brakes: service(zhCNLabels, {
      metaTitle: "列治文刹车检查与维修",
      metaDescription: "面向大温车主的刹车异响、抖动、踏板变化与警示灯检查。",
      eyebrow: "刹车服务",
      title: "刹车检查与维修",
      summary:
        "SPEEDX AUTO 在列治文 YVR 附近检查刹车异响、抖动、踏板变化、警示灯和可见磨损。多个部件可能产生相似症状，因此我们会先检查车辆，再建议零件或维修。如果制动感觉突然改变或让您担心安全，请在安全位置停止驾驶并安排专业协助。",
      symptoms: ["刹车时尖叫、摩擦或持续异响", "刹车时方向盘或踏板抖动", "踏板变软、变硬、变低或脚感变化", "刹车或 ABS 警示灯亮起"],
      inspections: ["可检查的刹车片、刹车盘、卡钳和附件", "刹车油状态与可见泄漏", "警示灯以及可安全复现的症状"],
      safetyBody: "刹车问题会影响车辆控制。不要仅凭网页说明判断车辆能否继续行驶；必要时应安排拖车或道路救援。",
      process: ["说明异响、踏板感觉、警示灯和出现条件", "将车辆送到车间进行刹车检查", "查看测量结果、维修方案和报价后再授权"],
      faqs: [
        { question: "刹车异响一定是刹车片磨完了吗？", answer: "不一定。异响有多种原因，需要检查后再决定更换哪些部件。" },
        { question: "刹车警示灯亮了还能开吗？", answer: "警示灯需要专业检查；若制动感觉改变或不安全，请停止驾驶并求助。" },
        { question: "更换零件前会报价吗？", answer: "会根据检查结果提出维修与报价，并在获得授权后进行。" },
      ],
      ctaBody: "告诉我们刹车症状、警示灯和车辆资料，以便安排正确检查。",
    }),
    diagnostics: service(zhCNLabels, {
      metaTitle: "列治文发动机故障灯与车辆诊断",
      metaDescription: "列治文 YVR 附近的警示灯、启动和行驶异常诊断。",
      eyebrow: "车辆诊断",
      title: "发动机故障灯与车辆诊断",
      summary:
        "SPEEDX AUTO 在列治文 YVR 附近检查发动机故障灯、其他警示灯、怠速不稳、启动困难和行驶异常。故障码通常只指出系统或检测到的状态，并不等同于确定损坏零件。我们会结合电脑资料、实车检查和针对性测试，再说明可能原因与下一步建议。",
      symptoms: ["发动机或其他警示灯持续亮起或反复出现", "怠速不稳、加速迟滞、动力下降或油耗异常", "间歇性无法启动、熄火或电气异常"],
      inspections: ["已存储和待定故障码", "相关实时数据、线路、接头与系统可见状况", "根据症状和初步结果选择的针对性测试"],
      safetyBody: "警示灯闪烁、过热、机油压力警告、严重动力下降、冒烟或强烈汽油味可能需要立即停车；继续驾驶有风险时请联系道路救援。",
      process: ["发送警示灯、症状和出现条件", "读取资料并检查相关系统，不凭故障码直接换件", "查看结果、进一步测试需求和维修方案"],
      faqs: [
        { question: "故障码能直接确定要换的零件吗？", answer: "通常不能。故障码指向系统或状态，需要结合测试判断。" },
        { question: "可以诊断偶发问题吗？", answer: "可以尝试，但偶发故障可能需要更多时间或重复测试；出现条件非常重要。" },
        { question: "故障灯闪烁还能开吗？", answer: "闪烁可能代表严重的当前故障，请降低风险、在安全处停车并寻求专业建议。" },
      ],
      ctaBody: "发送警示灯、症状和车辆资料，让我们选择正确的诊断起点。",
    }),
    suspension: service(zhCNLabels, {
      metaTitle: "列治文悬挂与转向检查",
      metaDescription: "面向大温车主的悬挂异响、跑偏、抖动与轮胎偏磨检查。",
      eyebrow: "悬挂与转向",
      title: "悬挂与转向检查",
      summary:
        "SPEEDX AUTO 在列治文 YVR 附近检查底盘异响、松旷、跑偏、转向变化、抖动和轮胎偏磨。相似症状可能来自轮胎、定位、转向、悬挂、轴承或其他部件。我们会先检查实车，再说明发现的问题、建议维修项目或是否需要进一步测试。",
      symptoms: ["经过颠簸路面时敲击、吱响或松旷", "车辆跑偏、游走或需要频繁修正", "转向力度或手感发生变化", "特定速度抖动或轮胎不均匀磨损"],
      inspections: ["可检查的转向与悬挂接头、胶套和固定件", "轮胎状况、磨损形态、车轮及相关可见部件", "在合适的路试或车间检查中确认症状"],
      safetyBody: "转向或悬挂故障会影响稳定与控制。突然松旷、严重抖动或转向响应异常时应立即谨慎处理，必要时安排拖车。",
      process: ["说明异响或操控变化及出现条件", "检查轮胎、转向、悬挂和相关部件", "查看结果与报价后授权所需工作"],
      faqs: [
        { question: "车辆跑偏一定要做四轮定位吗？", answer: "不一定。轮胎、刹车、转向、悬挂和路面都可能影响，需要先检查。" },
        { question: "悬挂磨损会造成轮胎偏磨吗？", answer: "可能会，但应同时检查轮胎、转向和定位相关状况。" },
        { question: "底盘异响可以继续忽略吗？", answer: "仅凭声音无法判断安全性，尤其伴随操控或转向变化时应尽快检查。" },
      ],
      ctaBody: "告诉我们异响、抖动或转向变化在什么时候出现，以便安排检查。",
    }),
  },
};

const traditionalPhrases: Array<[string, string]> = [
  ["联系我们", "聯絡我們"],
  ["联系团队", "聯絡團隊"],
  ["联系方式", "聯絡方式"],
  ["联系", "聯絡"],
  ["车辆", "車輛"],
  ["车主", "車主"],
  ["车间", "車間"],
  ["实车", "實車"],
  ["汽车", "汽車"],
  ["检查", "檢查"],
  ["维修", "維修"],
  ["刹车", "煞車"],
  ["故障灯", "故障燈"],
  ["警示灯", "警示燈"],
  ["悬挂", "懸吊"],
  ["转向", "轉向"],
  ["轮胎", "輪胎"],
  ["大温", "大溫"],
  ["信息", "資料"],
  ["仪表", "儀表"],
  ["保养", "保養"],
  ["异响", "異響"],
  ["抖动", "抖動"],
  ["启动", "啟動"],
  ["诊断", "診斷"],
  ["电脑", "電腦"],
  ["数据", "資料"],
  ["针对性", "針對性"],
  ["里程", "里程"],
  ["授权", "授權"],
  ["报价", "報價"],
  ["建议", "建議"],
  ["预约", "預約"],
  ["服务", "服務"],
  ["区域", "區域"],
  ["常见问题", "常見問題"],
  ["什么时候", "什麼時候"],
  ["什么", "什麼"],
  ["通过", "透過"],
  ["到店", "到店"],
  ["发送", "傳送"],
  ["资料", "資料"],
  ["记录", "紀錄"],
  ["处理", "處理"],
  ["继续", "繼續"],
  ["专业", "專業"],
  ["帮助", "協助"],
  ["道路救援", "道路救援"],
  ["发动机", "引擎"],
  ["油耗", "油耗"],
  ["电气", "電氣"],
  ["线路", "線路"],
  ["接头", "接頭"],
  ["进一步", "進一步"],
  ["状态", "狀態"],
  ["损坏", "損壞"],
  ["零件", "零件"],
  ["异常", "異常"],
  ["严重", "嚴重"],
  ["强烈", "強烈"],
  ["处", "處"],
  ["发", "發"],
  ["现", "現"],
  ["后", "後"],
  ["与", "與"],
  ["为", "為"],
  ["这", "這"],
  ["个", "個"],
  ["间", "間"],
  ["时", "時"],
  ["会", "會"],
  ["开", "開"],
  ["关", "關"],
  ["灯", "燈"],
  ["轮", "輪"],
  ["转", "轉"],
  ["变", "變"],
  ["经", "經"],
  ["过", "過"],
  ["频", "頻"],
  ["应", "應"],
  ["动", "動"],
  ["响", "響"],
  ["损", "損"],
  ["旧", "舊"],
  ["买", "買"],
  ["卖", "賣"],
  ["单", "單"],
  ["换", "換"],
  ["选择", "選擇"],
  ["说明", "說明"],
  ["范围", "範圍"],
  ["让", "讓"],
  ["从", "從"],
  ["统一", "統一"],
  ["灯光", "燈光"],
  ["滤芯", "濾芯"],
  ["油液", "油液"],
  ["泄漏", "洩漏"],
  ["脚感", "腳感"],
  ["方向盘", "方向盤"],
  ["卡钳", "卡鉗"],
  ["测量", "測量"],
  ["复现", "重現"],
  ["需要", "需要"],
  ["仅", "僅"],
  ["网页", "網頁"],
  ["安排", "安排"],
  ["电脑", "電腦"],
  ["间歇性", "間歇性"],
  ["无法", "無法"],
  ["读取", "讀取"],
  ["闪烁", "閃爍"],
  ["降低", "降低"],
  ["挂", "掛"],
  ["松旷", "鬆曠"],
  ["跑偏", "偏行"],
  ["车轮", "車輪"],
  ["胶套", "橡膠襯套"],
  ["固定件", "固定件"],
  ["路试", "路試"],
  ["稳定", "穩定"],
  ["响应", "反應"],
  ["四轮定位", "四輪定位"],
  ["伴随", "伴隨"],
  ["尽快", "儘快"],
  ["于", "於"],
  ["年", "年"],
  ["月", "月"],
];

function toTraditional(value: string): string {
  return traditionalPhrases.reduce(
    (translated, [simplified, traditional]) =>
      translated.replaceAll(simplified, traditional),
    value,
  );
}

function translateRepairCopy<T>(value: T): T {
  if (typeof value === "string") return toTraditional(value) as T;
  if (Array.isArray(value)) return value.map(translateRepairCopy) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        translateRepairCopy(nestedValue),
      ]),
    ) as T;
  }
  return value;
}

/**
 * The hub page is written directly in Traditional Chinese for Cantonese-speaking
 * readers; only the service guides still go through the phrase converter.
 */
const zhTWHub: Omit<AutoRepairCopy, "services"> = {
  metaTitle: "列治文車房 · 汽車維修與 Tesla 電動車維修",
  metaDescription:
    "列治文車房，近溫哥華機場：保養、煞車、故障診斷、避震轉向、Tesla 電動車維修。工時費每小時 $120，按行業標準工時收費。粵語、普通話、英語服務。",
  eyebrow: "汽車維修 · 列治文",
  title: "列治文汽車維修與電動車維修",
  summary:
    "SPEEDX AUTO 速馳汽車是位於列治文 2980 Number 3 Road 的車房，鄰近溫哥華國際機場（YVR）。我們提供定期保養、煞車、故障診斷、避震及轉向維修，亦維修電動車，以 Tesla 為主。工時費每小時 120 加元，按行業標準工時收費；零件來自 WorldPac，按標價報價。店內可說粵語、普通話及英語，須預先預約。",
  serviceName: "汽車維修與保養",
  serviceType: "汽車維修",
  facts: {
    title: "基本資料",
    items: [
      { label: "工時費", value: "每小時 $120（未連稅）" },
      { label: "工時標準", value: "按行業標準工時手冊（ALLDATA）計算，並非隨意計時" },
      { label: "零件", value: "WorldPac 零件，按標價報價" },
      { label: "電動車", value: "以 Tesla 為主：電池檢測、電動馬達維修、故障碼檢測" },
      { label: "服務語言", value: "粵語、普通話、英語" },
      { label: "付款方式", value: "現金、信用卡、微信支付" },
      { label: "預約", value: "須預約，可透過 WhatsApp、電話或微信" },
      { label: "網上估價", value: "本頁的 AI 估價助手" },
    ],
    hoursLabel: "營業時間",
    addressLabel: "地址",
  },
  pricing: {
    title: "維修大概要多少錢",
    intro: "每份報價都由工時費和零件費組成。開工前，您會看到工時數、每小時收費和可選零件。",
    laborRateLabel: "工時費",
    laborTitle: "工時費怎樣計算",
    laborBody:
      "工時費 = 每小時 120 加元 × 行業標準工時手冊為該車型、該項工作訂明的工時。車房使用的系統是 ALLDATA。工時由手冊決定，並非看師傅實際做了多久。例如 2019 年 Toyota Camry LE 更換前煞車片，標準工時為 1.1 小時，工時費即 132 加元。",
    columns: {
      job: "項目",
      laborTime: "標準工時",
      total: "總價範圍",
      examples: "實例",
    },
    rows: [
      {
        job: "更換前煞車片",
        laborTime: "0.8–1.1 小時",
        total: "$205–$405",
        examples: "2018 Toyota Corolla：$206 · 2019 Toyota Camry：$291–$318",
      },
      {
        job: "更換後煞車片",
        laborTime: "0.9–1.1 小時",
        total: "$225–$325",
        examples: "2018 Honda Civic：$240–$275 · 2018 Mercedes-Benz C300：$324",
      },
      {
        job: "更換 12V 電池",
        laborTime: "0.3–0.7 小時",
        total: "$270–$580",
        examples: "2016 Mazda3：$287–$424 · 2017 Honda CR-V：$371–$391",
      },
      {
        job: "更換前避震器總成",
        laborTime: "1.9–2.4 小時",
        total: "$495–$795",
        examples: "2019 Subaru Outback：$496–$667 · 2015 Honda Accord：$555–$794",
      },
      {
        job: "更換發電機",
        laborTime: "0.8–3.6 小時",
        total: "$750–$1,700",
        examples: "2020 Toyota RAV4：$750–$898 · 2016 Toyota Highlander：$786–$911",
      },
      {
        job: "更換節溫器",
        laborTime: "1.6–2.4 小時",
        total: "$235–$355",
        examples: "2018 Toyota Camry：$239–$305 · 2016 Toyota Highlander：$336–$355",
      },
      {
        job: "更換機油及機油格",
        laborTime: "0.5 小時",
        total: "工時 $60 + 機油及機油格",
        examples: "機油按引擎所需公升數計價",
      },
      {
        job: "更換冷氣濾網",
        laborTime: "0.3 小時",
        total: "約 $85",
        examples: "2017 Honda CR-V：$85–$86",
      },
    ],
    footnote:
      "以上為零件加工時的未連稅總價，取自 2026 年 10 月 11–12 日估價助手產生的真實報價，根據 WorldPac 標價及標準工時，車款為 2015–2020 年的 Toyota、Honda、Mazda、Nissan、Subaru、Volkswagen 及 Mercedes-Benz。實際價格視乎具體車款和所選零件，檢查時亦可能發現其他需要處理的問題。開工前我們會先與您確認報價。",
  },
  scope: {
    title: "維修範圍",
    offeredTitle: "機械維修與保養",
    offered: [
      "定期保養、換機油",
      "煞車片、煞車碟、卡鉗、煞車油",
      "引擎故障燈及電路診斷",
      "避震及轉向",
      "電池、發電機、摩打（啟動馬達）",
      "冷卻系統及節溫器",
      "Tesla 等電動車的電池檢測、電動馬達維修、故障碼檢測",
    ],
    quoteTitle: "鈑金噴油：另行報價",
    quoteBody: "鈑金及噴油可以做，需另行報價。請透過 WhatsApp 或微信傳送損傷相片，客服會回覆報價。",
    notOfferedTitle: "不提供",
    notOfferedBody: "不做波箱（變速箱）維修或大修。",
  },
  ev: {
    title: "Tesla 及電動車維修",
    body: "我們維修電動車，以 Tesla 為主。工時費同樣是每小時 120 加元，按標準工時收費。",
    items: ["高壓電池檢測", "電動馬達維修", "故障碼讀取及診斷", "電動車的煞車、避震及定期保養"],
    note: "其他品牌的電動車，請先傳送車款和問題，我們確認能否承接。",
  },
  servicesTitle: "維修項目指南",
  servicesIntro: "每份指南介紹常見症狀、檢查內容，以及甚麼情況下應停止駕駛。最終建議與報價以實車檢查為準。",
  whyTitle: "為甚麼選擇 SPEEDX AUTO",
  whyItems: [
    { title: "按標準工時收費", body: "工時數來自行業標準工時手冊，帳單上的工時就是該項工作的訂明工時。" },
    { title: "零件按標價", body: "零件來自 WorldPac，按標價報價；同一零件有多個品牌時，您可以自行選擇。" },
    { title: "三種語言溝通", body: "粵語、普通話、英語都可以，電話、WhatsApp、微信都能聯絡。" },
    { title: "車隊保養經驗", body: "SPEEDX AUTO 自營租車車隊的 100 多部車，亦由這個車房保養。" },
  ],
  serviceAreaTitle: "列治文及大溫地區",
  serviceAreaBody: "車房位於列治文 2980 Number 3 Road，鄰近 YVR，服務列治文及大溫各區車主。到店前請先預約。",
  serviceAreaPlaces: ["列治文", "溫哥華", "本拿比", "三角洲", "素里", "新西敏"],
  faqTitle: "汽車維修常見問題",
  faqs: [
    {
      question: "在 SPEEDX AUTO 維修大概要多少錢？",
      answer:
        "工時費為每小時 120 加元乘以該項目的標準工時，再加上按 WorldPac 標價計算的零件費。大部分 2015–2020 年車款更換前煞車片，連零件約 205–405 加元。開工前會給您完整報價。",
    },
    {
      question: "工時是怎樣定的？",
      answer: "按行業標準工時手冊為您的車款、該項工作訂明的工時計算（車房使用 ALLDATA 系統），並非按秒錶或憑感覺估算。",
    },
    {
      question: "可以先在網上估價嗎？",
      answer:
        "可以。在本頁填寫姓名和電話開啟估價助手，描述車輛和問題，它會列出可能原因，並按我們的工時費、標準工時和現時零件標價計出參考價。最終報價以到店檢查為準。",
    },
    {
      question: "可以維修 Tesla 和其他電動車嗎？",
      answer: "可以，以 Tesla 為主。可做高壓電池檢測、電動馬達維修、故障碼診斷，以及煞車、避震等一般項目。其他品牌電動車請先聯絡確認。",
    },
    { question: "需要預約嗎？", answer: "需要。請透過 WhatsApp、電話或微信預約，確認時間和維修項目。" },
    { question: "店內說甚麼語言？", answer: "粵語、普通話及英語。" },
    { question: "可以怎樣付款？", answer: "現金、信用卡或微信支付。" },
    { question: "有沒有做鈑金噴油？", answer: "有，需另行報價。請透過 WhatsApp 或微信傳送損傷相片，客服會回覆報價。" },
    { question: "有沒有維修波箱？", answer: "沒有。我們不做波箱（變速箱）維修或大修。" },
    { question: "零件從哪裡來？", answer: "來自 WorldPac，按標價報價。同一零件有多個品牌適用時，估價單會列出選項供您選擇。" },
    {
      question: "聯絡時應提供甚麼資料？",
      answer: "請提供年份、品牌、型號、里程、故障燈、症狀及出現情況，相片或短片亦很有幫助。最終診斷需要檢查實車。",
    },
    {
      question: "車房在哪裡？",
      answer: "2980 Number 3 Rd, Richmond, BC V6X 2B3，鄰近溫哥華國際機場。營業時間週一至週六 10:00 - 18:30，週日休息。",
    },
  ],
  ctaTitle: "預約維修",
  ctaBody: "透過 WhatsApp 或微信傳送車輛資料和問題，或直接致電 SPEEDX AUTO 預約。",
  lastUpdated: "更新於 2026 年 10 月 12 日",
};

export const zhTWAutoRepair: AutoRepairCopy = {
  ...zhTWHub,
  services: translateRepairCopy(zhCNAutoRepair.services),
};
