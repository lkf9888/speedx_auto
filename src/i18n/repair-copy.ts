import {
  enRepairServices,
  zhCNRepairServices,
  zhTWRepairServices,
} from "@/i18n/repair-service-copy";
import {
  enPriceGuide,
  zhCNPriceGuide,
  zhTWPriceGuide,
} from "@/i18n/repair-price-guide-copy";
import type { AutoRepairCopy } from "@/i18n/types";

export const enAutoRepair: AutoRepairCopy = {
  metaTitle: "Auto Repair & Tesla Service in Richmond, BC",
  metaDescription:
    "Richmond auto repair near YVR: maintenance, brakes, diagnostics, suspension and Tesla/EV service. Labor billed by industry-standard times. English, Cantonese, Mandarin.",
  eyebrow: "Auto repair · Richmond, BC",
  title: "Auto Repair & EV Service in Richmond, BC",
  summary:
    "SPEEDX AUTO is an auto repair shop at 2980 Number 3 Road in Richmond, BC, near YVR. We handle maintenance, brakes, diagnostics, suspension, and electric vehicles, mainly Tesla. Labor is billed by industry-standard labor-guide times, and parts come from WorldPac at list price. We speak English, Cantonese, and Mandarin. Appointments are required.",
  serviceName: "Auto repair and maintenance",
  serviceType: "Auto repair",
  facts: {
    title: "At a glance",
    items: [
      { label: "Labor time", value: "Industry-standard labor-guide times (ALLDATA), not a stopwatch" },
      { label: "Parts", value: "WorldPac parts, quoted at list price" },
      { label: "Oil change", value: "From $95, oil and filter included" },
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
      "Every quote is labor plus parts. You see the labor hours and the parts options before any work starts.",
    laborTitle: "How labor is calculated",
    laborBody:
      "Labor is billed by the time an industry-standard labor guide sets for that job on your exact vehicle. Our shop system is ALLDATA. The guide sets the hours, not a clock running in the bay. For example, front brake pads on a 2019 Toyota Camry LE are rated at 1.1 hours of labor.",
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
        total: "$185–$444",
        examples: "2018 Toyota Corolla: $185–$227 · 2019 Toyota Camry: $262–$350",
      },
      {
        job: "Rear brake pads",
        laborTime: "0.9–1.1 h",
        total: "$204–$356",
        examples: "2018 Honda Civic: $216–$303 · 2018 Mercedes-Benz C300: $292–$356",
      },
      {
        job: "12-volt battery",
        laborTime: "0.3–0.7 h",
        total: "$244–$634",
        examples: "2016 Mazda3: $258–$466 · 2017 Honda CR-V: $334–$430",
      },
      {
        job: "Front strut assemblies",
        laborTime: "1.9–2.4 h",
        total: "$446–$873",
        examples: "2019 Subaru Outback: $446–$734 · 2015 Honda Accord: $500–$873",
      },
      {
        job: "Alternator",
        laborTime: "0.8–3.6 h",
        total: "$675–$1,866",
        examples: "2020 Toyota RAV4: $675–$988 · 2016 Toyota Highlander: $707–$1,002",
      },
      {
        job: "Engine thermostat",
        laborTime: "1.6–2.4 h",
        total: "$215–$391",
        examples: "2018 Toyota Camry: $215–$336 · 2016 Toyota Highlander: $302–$391",
      },
      {
        job: "Cabin air filter",
        laborTime: "0.3 h",
        total: "$77–$95",
        examples: "2017 Honda CR-V: $77–$95",
      },
    ],
    footnote:
      "Totals are parts plus labor, before tax. They come from real estimates our estimate assistant produced on October 11–12, 2026, using WorldPac list prices and labor-guide times for 2015–2020 Toyota, Honda, Mazda, Nissan, Subaru, Volkswagen, and Mercedes-Benz models, widened by 10% each way like the estimate assistant's ranges. Your price depends on the exact vehicle and the parts you choose, and inspection may find other work. We confirm the quote with you before starting.",
    flat: {
      title: "Flat-price services",
      intro: "Oil changes, tire changes, and A/C recharges are charged from the shop's posted price list, not by labor time.",
      columns: { service: "Service", price: "Price" },
      oilCar: "Oil change, car or small SUV",
      oilLarge: "Oil change, large SUV or pickup",
      oilEuropean: "Oil change, European vehicle",
      oilDiesel: "Oil change, diesel",
      tire: "Tire change, per tire",
      ac: "A/C refrigerant recharge",
      regularOil: "Regular 0W-20",
      premiumOil: "Premium 0W-30",
      oemOil: "OEM oil",
      dieselCar: "Car",
      dieselSuv: "SUV or truck",
      tireUpTo18: "Up to 18 in.",
      tireOver18: "Over 18 in.",
      tireRunFlat: "Run-flat",
      tireOffRoad: "AT / RT / MT",
      r134a: "R-134a (older systems)",
      r1234yf: "R-1234yf (newer systems)",
      note: "Before tax. Oil change prices include oil and filter; tire change prices cover the work, and tires are extra. Vehicles with V8 or larger engines, or that sold new above $120,000, are quoted by the team.",
    },
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
      "Tire changes and A/C refrigerant recharge",
      "Tesla and EV battery checks, drive motor repair, and fault codes",
    ],
    quoteTitle: "Body work and paint: quoted case by case",
    quoteBody:
      "We do body and paint work, but it is quoted individually. Send photos of the damage by WhatsApp or WeChat and the team will reply with a quote.",
    notOfferedTitle: "Not offered",
    notOfferedBody: "We don't repair or rebuild transmissions, and we don't replace windshields or other auto glass.",
  },
  ev: {
    title: "Tesla and electric vehicle service",
    body:
      "We service electric vehicles, mainly Tesla. Labor is billed the same way, using labor-guide times.",
    items: [
      "High-voltage battery checks",
      "Drive motor repair",
      "Fault-code reading and diagnosis",
      "Brakes, suspension, and routine maintenance on EVs",
    ],
    note: "For other EV brands, send the model and the problem first and we will confirm whether we can take the job.",
    linkLabel: "Read the Tesla and EV repair guide",
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
        "Labor is billed by the labor-guide time for the job, plus parts at WorldPac list price. Front brake pads on most 2015–2020 cars came to $185–$444 including parts. You get the full quote before any work starts.",
    },
    {
      question: "How much is an oil change?",
      answer:
        "For a car or small SUV, $95 with regular 0W-20 oil or $120 with premium 0W-30, oil and filter included. A large SUV or pickup is $150 or $180, a European vehicle is $220 with OEM oil, and diesels are $280–$320. V8 engines are quoted by the team.",
    },
    {
      question: "How do you decide how many labor hours to charge?",
      answer:
        "We use the time an industry-standard labor guide publishes for that job on your vehicle (our shop system is ALLDATA). The hours are not set by a stopwatch or a guess.",
    },
    {
      question: "Can I get an estimate online?",
      answer:
        "Yes. Open the estimate assistant on this page with your name and phone number, then describe the vehicle and the problem. It suggests likely causes and builds a ballpark price from labor-guide times and current parts list prices. The final quote follows an inspection.",
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
  services: enRepairServices,
  priceGuide: enPriceGuide,
};

export const zhCNAutoRepair: AutoRepairCopy = {
  metaTitle: "列治文汽车维修 · 特斯拉电动车维修",
  metaDescription:
    "列治文修车厂，靠近温哥华机场：保养、刹车、故障诊断、悬挂转向、特斯拉电动车维修。工时费按行业标准工时计费。普通话、粤语、英语服务。",
  eyebrow: "汽车维修 · 列治文",
  title: "汽车与电动车机械维修",
  heroSummary:
    "SPEEDX AUTO 做汽车常规保养、刹车、故障诊断、悬挂转向，也修电动车，以特斯拉为主。店里讲普通话、粤语和英语，需提前预约。",
  summary:
    "SPEEDX AUTO 速驰汽车是位于列治文 2980 Number 3 Road 的修车厂，靠近温哥华国际机场（YVR）。我们做常规保养、刹车、故障诊断、悬挂转向，也修电动车，以特斯拉为主。工时费按行业标准工时计费；配件来自 WorldPac，按标价报价。店里讲普通话、粤语和英语，需提前预约。",
  serviceName: "汽车维修与保养",
  serviceType: "汽车维修",
  facts: {
    title: "基本信息",
    items: [
      { label: "工时标准", value: "按行业标准工时手册（ALLDATA）计时，不按实际干活时间随意计算" },
      { label: "配件", value: "WorldPac 配件，按标价报价" },
      { label: "换机油", value: "$95 起，含机油和机滤" },
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
    intro: "每份报价都由工时费和配件费组成。开工前，您会看到工时数和可选配件。",
    laborTitle: "工时费怎么算",
    laborBody:
      "工时费按行业标准工时手册给这款车、这项工作规定的工时计算。店里使用的系统是 ALLDATA。工时由手册决定，不是看技师在车间里实际干了多久。例如 2019 款丰田凯美瑞 LE 换前刹车片，标准工时为 1.1 小时。",
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
        total: "$185–$444",
        examples: "2018 丰田卡罗拉：$185–$227 · 2019 丰田凯美瑞：$262–$350",
      },
      {
        job: "换后刹车片",
        laborTime: "0.9–1.1 小时",
        total: "$204–$356",
        examples: "2018 本田思域：$216–$303 · 2018 奔驰 C300：$292–$356",
      },
      {
        job: "换 12V 电瓶",
        laborTime: "0.3–0.7 小时",
        total: "$244–$634",
        examples: "2016 马自达 3：$258–$466 · 2017 本田 CR-V：$334–$430",
      },
      {
        job: "换前减震器总成",
        laborTime: "1.9–2.4 小时",
        total: "$446–$873",
        examples: "2019 斯巴鲁傲虎：$446–$734 · 2015 本田雅阁：$500–$873",
      },
      {
        job: "换发电机",
        laborTime: "0.8–3.6 小时",
        total: "$675–$1,866",
        examples: "2020 丰田 RAV4：$675–$988 · 2016 丰田汉兰达：$707–$1,002",
      },
      {
        job: "换节温器",
        laborTime: "1.6–2.4 小时",
        total: "$215–$391",
        examples: "2018 丰田凯美瑞：$215–$336 · 2016 丰田汉兰达：$302–$391",
      },
      {
        job: "换空调滤芯",
        laborTime: "0.3 小时",
        total: "$77–$95",
        examples: "2017 本田 CR-V：$77–$95",
      },
    ],
    footnote:
      "以上为配件加工时的税前总价，取自 2026 年 10 月 11–12 日估价助手生成的真实报价，基于 WorldPac 标价和标准工时，车型为 2015–2020 年的丰田、本田、马自达、日产、斯巴鲁、大众和奔驰，并和估价助手一样上下各放宽 10%。实际价格取决于具体车型和所选配件，检查时也可能发现其他需要处理的问题。开工前我们会先和您确认报价。",
    flat: {
      title: "一口价项目",
      intro: "换机油、换胎和空调加冷媒按店里的价目表一口价收费，不按工时计算。",
      columns: { service: "项目", price: "价格" },
      oilCar: "换机油：普通轿车 / 小 SUV",
      oilLarge: "换机油：大型 SUV / 皮卡",
      oilEuropean: "换机油：欧洲车",
      oilDiesel: "换机油：柴油车",
      tire: "换胎（每条）",
      ac: "空调加冷媒（雪种）",
      regularOil: "普通机油 0W-20",
      premiumOil: "高级机油 0W-30",
      oemOil: "原厂机油",
      dieselCar: "轿车",
      dieselSuv: "SUV / 皮卡",
      tireUpTo18: "18 寸及以下",
      tireOver18: "18 寸以上",
      tireRunFlat: "防爆胎",
      tireOffRoad: "AT / RT / MT 越野胎",
      r134a: "R-134a（旧系统）",
      r1234yf: "R-1234yf（新系统）",
      note: "以上为税前价格。换机油含机油和机滤；换胎价格只含工钱，轮胎另计。V8 及以上发动机、或新车价超过 12 万加元的车辆，由团队单独报价。",
    },
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
      "换胎、空调加冷媒",
      "特斯拉等电动车的电池检测、电机维修、故障码检测",
    ],
    quoteTitle: "钣金喷漆：单独报价",
    quoteBody: "钣金和喷漆可以做，需要单独报价。请通过 WhatsApp 或微信发送损伤照片，客服会回复报价。",
    notOfferedTitle: "不提供",
    notOfferedBody: "不做变速箱维修或大修，也不更换挡风玻璃和车窗玻璃。",
  },
  ev: {
    title: "特斯拉与电动车维修",
    body: "我们维修电动车，以特斯拉为主。工时费同样按标准工时计费。",
    items: ["高压电池检测", "驱动电机维修", "故障码读取与诊断", "电动车的刹车、悬挂和常规保养"],
    note: "其他品牌的电动车，请先发送车型和问题，我们确认能否承接。",
    linkLabel: "查看特斯拉与电动车维修详情",
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
        "工时费按该项目的标准工时计算，再加上按 WorldPac 标价计算的配件费。大多数 2015–2020 年车型换前刹车片，含配件约 185–444 加元。开工前会给您完整报价。",
    },
    {
      question: "换机油多少钱？",
      answer:
        "普通轿车或小 SUV：普通机油 0W-20 为 95 加元，高级机油 0W-30 为 120 加元，含机油和机滤。大型 SUV 或皮卡 150 / 180 加元，欧洲车原厂机油 220 加元，柴油车 280–320 加元。V8 发动机由团队单独报价。",
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
  services: zhCNRepairServices,
  priceGuide: zhCNPriceGuide,
};

const zhTWHub: Omit<AutoRepairCopy, "services" | "priceGuide"> = {
  metaTitle: "列治文車房 · 汽車維修與 Tesla 電動車維修",
  metaDescription:
    "列治文車房，近溫哥華機場：保養、煞車、故障診斷、避震轉向、Tesla 電動車維修。工時費按行業標準工時收費。粵語、普通話、英語服務。",
  eyebrow: "汽車維修 · 列治文",
  title: "汽車與電動車機械維修",
  heroSummary:
    "SPEEDX AUTO 提供汽車定期保養、煞車、故障診斷、避震及轉向維修，亦維修電動車，以 Tesla 為主。店內可說粵語、普通話及英語，須預先預約。",
  summary:
    "SPEEDX AUTO 速馳汽車是位於列治文 2980 Number 3 Road 的車房，鄰近溫哥華國際機場（YVR）。我們提供定期保養、煞車、故障診斷、避震及轉向維修，亦維修電動車，以 Tesla 為主。工時費按行業標準工時收費；零件來自 WorldPac，按標價報價。店內可說粵語、普通話及英語，須預先預約。",
  serviceName: "汽車維修與保養",
  serviceType: "汽車維修",
  facts: {
    title: "基本資料",
    items: [
      { label: "工時標準", value: "按行業標準工時手冊（ALLDATA）計算，並非隨意計時" },
      { label: "零件", value: "WorldPac 零件，按標價報價" },
      { label: "換機油", value: "$95 起，已包機油及機油格" },
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
    intro: "每份報價都由工時費和零件費組成。開工前，您會看到工時數和可選零件。",
    laborTitle: "工時費怎樣計算",
    laborBody:
      "工時費按行業標準工時手冊為該車型、該項工作訂明的工時計算。車房使用的系統是 ALLDATA。工時由手冊決定，並非看師傅實際做了多久。例如 2019 年 Toyota Camry LE 更換前煞車片，標準工時為 1.1 小時。",
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
        total: "$185–$444",
        examples: "2018 Toyota Corolla：$185–$227 · 2019 Toyota Camry：$262–$350",
      },
      {
        job: "更換後煞車片",
        laborTime: "0.9–1.1 小時",
        total: "$204–$356",
        examples: "2018 Honda Civic：$216–$303 · 2018 Mercedes-Benz C300：$292–$356",
      },
      {
        job: "更換 12V 電池",
        laborTime: "0.3–0.7 小時",
        total: "$244–$634",
        examples: "2016 Mazda3：$258–$466 · 2017 Honda CR-V：$334–$430",
      },
      {
        job: "更換前避震器總成",
        laborTime: "1.9–2.4 小時",
        total: "$446–$873",
        examples: "2019 Subaru Outback：$446–$734 · 2015 Honda Accord：$500–$873",
      },
      {
        job: "更換發電機",
        laborTime: "0.8–3.6 小時",
        total: "$675–$1,866",
        examples: "2020 Toyota RAV4：$675–$988 · 2016 Toyota Highlander：$707–$1,002",
      },
      {
        job: "更換節溫器",
        laborTime: "1.6–2.4 小時",
        total: "$215–$391",
        examples: "2018 Toyota Camry：$215–$336 · 2016 Toyota Highlander：$302–$391",
      },
      {
        job: "更換冷氣濾網",
        laborTime: "0.3 小時",
        total: "$77–$95",
        examples: "2017 Honda CR-V：$77–$95",
      },
    ],
    footnote:
      "以上為零件加工時的未連稅總價，取自 2026 年 10 月 11–12 日估價助手產生的真實報價，根據 WorldPac 標價及標準工時，車款為 2015–2020 年的 Toyota、Honda、Mazda、Nissan、Subaru、Volkswagen 及 Mercedes-Benz，並與估價助手一樣上下各放寬 10%。實際價格視乎具體車款和所選零件，檢查時亦可能發現其他需要處理的問題。開工前我們會先與您確認報價。",
    flat: {
      title: "一口價項目",
      intro: "換機油、換胎和冷氣加雪種按車房價目表一口價收費，不按工時計算。",
      columns: { service: "項目", price: "價錢" },
      oilCar: "換機油：一般轎車 / 小型 SUV",
      oilLarge: "換機油：大型 SUV / 皮卡",
      oilEuropean: "換機油：歐洲車",
      oilDiesel: "換機油：柴油車",
      tire: "換胎（每條）",
      ac: "冷氣加雪種（冷媒）",
      regularOil: "普通機油 0W-20",
      premiumOil: "高級機油 0W-30",
      oemOil: "原廠機油",
      dieselCar: "轎車",
      dieselSuv: "SUV / 皮卡",
      tireUpTo18: "18 吋或以下",
      tireOver18: "18 吋以上",
      tireRunFlat: "防爆胎",
      tireOffRoad: "AT / RT / MT 越野胎",
      r134a: "R-134a（舊系統）",
      r1234yf: "R-1234yf（新系統）",
      note: "以上為未連稅價錢。換機油已包機油及機油格；換胎價錢只計工錢，輪胎另計。V8 或以上引擎、或新車價超過 12 萬加元的車輛，由團隊另行報價。",
    },
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
      "換胎、冷氣加雪種",
      "Tesla 等電動車的電池檢測、電動馬達維修、故障碼檢測",
    ],
    quoteTitle: "鈑金噴油：另行報價",
    quoteBody: "鈑金及噴油可以做，需另行報價。請透過 WhatsApp 或微信傳送損傷相片，客服會回覆報價。",
    notOfferedTitle: "不提供",
    notOfferedBody: "不做波箱（變速箱）維修或大修，亦不更換擋風玻璃及車窗玻璃。",
  },
  ev: {
    title: "Tesla 及電動車維修",
    body: "我們維修電動車，以 Tesla 為主。工時費同樣按標準工時收費。",
    items: ["高壓電池檢測", "電動馬達維修", "故障碼讀取及診斷", "電動車的煞車、避震及定期保養"],
    note: "其他品牌的電動車，請先傳送車款和問題，我們確認能否承接。",
    linkLabel: "查看 Tesla 及電動車維修詳情",
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
        "工時費按該項目的標準工時計算，再加上按 WorldPac 標價計算的零件費。大部分 2015–2020 年車款更換前煞車片，連零件約 185–444 加元。開工前會給您完整報價。",
    },
    {
      question: "換機油要多少錢？",
      answer:
        "一般轎車或小型 SUV：普通機油 0W-20 為 95 加元，高級機油 0W-30 為 120 加元，已包機油及機油格。大型 SUV 或皮卡 150 / 180 加元，歐洲車原廠機油 220 加元，柴油車 280–320 加元。V8 引擎由團隊另行報價。",
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
  services: zhTWRepairServices,
  priceGuide: zhTWPriceGuide,
};
