/**
 * Copy for the public price guide (/auto-repair/prices). Text in braces, such
 * as {frontPads}, is filled from src/lib/repair-price-guide.ts and FLAT_PRICES
 * when the page renders, so the numbers always match the data.
 */
import type { PriceGuideCopy } from "@/i18n/types";

export const enPriceGuide: PriceGuideCopy = {
  metaTitle: "Car Repair Prices in Vancouver & Richmond, 2026",
  metaDescription:
    "Real 2026 repair prices from a Richmond, BC shop: brake pads, batteries, alternators, struts, oil changes and more, listed by vehicle. Parts and labor, before tax.",
  eyebrow: "Price guide",
  title: "Car Repair Prices in Richmond and Metro Vancouver (2026)",
  navLabel: "Price guide",
  summary:
    "These are real repair prices from SPEEDX AUTO in Richmond, BC: {quotes} quotes for {jobs} common jobs on 2012–2020 vehicles, built from industry-standard labor-guide times and WorldPac parts list prices. Front brake pads ran {frontPads} and a 12-volt battery {battery}, parts and labor included, before tax. Your price depends on the vehicle and the parts you choose.",
  lastUpdated: "Prices quoted October 11–12, 2026",
  flatTitle: "Flat-price services",
  flatIntro: "Oil changes, tire changes, and A/C recharges are charged from the shop's posted price list.",
  systemTitles: {
    brakes: "Brakes",
    electrical: "Battery, charging, and starting",
    engine: "Engine, cooling, and maintenance",
    suspension: "Suspension and driveline",
  },
  jobNames: {
    frontPads: "Front brake pads",
    rearPads: "Rear brake pads",
    frontRotors: "Front brake rotors",
    rearRotors: "Rear brake rotors",
    brakeBleed: "Brake fluid bleed",
    masterCylinder: "Brake master cylinder",
    battery: "12-volt battery",
    alternator: "Alternator",
    starter: "Starter motor",
    thermostat: "Engine thermostat",
    coolantTank: "Coolant expansion tank",
    oxygenSensor: "Oxygen sensor",
    evapCanister: "EVAP charcoal canister",
    fuelCap: "Fuel cap",
    driveBelt: "Drive belt",
    timingBelt: "Timing belt",
    acCompressor: "A/C compressor",
    cabinFilter: "Cabin air filter",
    frontStruts: "Front strut assemblies",
    rearStruts: "Rear shock or strut assemblies",
    strutMount: "Strut mount",
    swayBarLinks: "Sway bar links",
    cvAxle: "CV axle",
  },
  columns: { job: "Job", vehicle: "Vehicle", laborTime: "Labor-guide time", parts: "Parts", total: "Total" },
  hoursUnit: "h",
  methodTitle: "How these prices were put together",
  methodItems: [
    "Every total is parts plus labor, before GST and PST.",
    "Labor hours are the industry-standard labor-guide times for that job on that vehicle, not a stopwatch. Parts are WorldPac list prices; where several parts fit, the range runs from the lowest to the highest option.",
    "The quotes came from SPEEDX AUTO's online estimate assistant on October 11–12, 2026. Totals are widened by 10% each way, the same allowance the assistant shows customers, because inspection can change the final price.",
    "Oil changes, tire changes, and A/C recharges use the shop's posted flat prices.",
    "Parts prices change. We confirm the exact quote for your vehicle before any work starts.",
  ],
  faqTitle: "Repair price questions",
  faqs: [
    {
      question: "How much do front brake pads cost in Vancouver?",
      answer:
        "At SPEEDX AUTO in Richmond, front brake pads on the 2015–2020 vehicles we quoted ran {frontPads}, parts and labor included, before tax. The vehicle and the pad you choose make the difference.",
    },
    {
      question: "How much does a car battery replacement cost?",
      answer:
        "{battery} installed for the gasoline cars and SUVs we quoted, depending on the battery size and type. The 12-volt auxiliary battery in a 2010 Toyota Prius hybrid was {hybridBattery}.",
    },
    {
      question: "How much is an oil change in Richmond?",
      answer:
        "{oilCar} for a car or small SUV with regular oil and {oilCarPremium} with premium oil, oil and filter included. Large SUVs and pickups are {oilLarge}.",
    },
    {
      question: "Why does the same repair cost more on some cars?",
      answer:
        "The labor guide sets different hours for each vehicle, and parts prices differ. For example, an alternator is rated at 0.8 hours on a 2020 Toyota RAV4 but 4.0 hours on a 2019 Ford Escape.",
    },
    {
      question: "Do these prices include tax?",
      answer: "No. All prices are before GST and PST.",
    },
    {
      question: "Can I get a price for my own car?",
      answer:
        "Yes. The estimate assistant on our auto repair page looks up your vehicle and gives a price range in a few minutes. We confirm the final quote after inspecting the car.",
    },
  ],
  ctaTitle: "Get a price for your car",
  ctaBody: "Ask the estimate assistant, or send your vehicle and the problem by WhatsApp or WeChat.",
  estimateLabel: "Open the estimate assistant",
  linkLabel: "See the full price guide",
};

export const zhCNPriceGuide: PriceGuideCopy = {
  metaTitle: "温哥华修车价格参考 2026：刹车片、电瓶、减震",
  metaDescription:
    "列治文修车厂的 2026 年真实维修价格：刹车片、电瓶、发电机、减震器、换机油等，按车型列出，含配件和工时，税前价格。",
  eyebrow: "价格参考",
  title: "大温哥华汽车维修价格参考（2026）",
  navLabel: "价格参考",
  summary:
    "以下是列治文 SPEEDX AUTO 的真实维修价格：{jobs} 个常见项目、共 {quotes} 份报价，车型为 2012–2020 年，按行业标准工时和 WorldPac 配件标价计算。换前刹车片 {frontPads}，换 12V 电瓶 {battery}，均含配件和工时，税前价格。实际价格取决于车型和所选配件。",
  lastUpdated: "报价日期：2026 年 10 月 11–12 日",
  flatTitle: "一口价项目",
  flatIntro: "换机油、换胎和空调加冷媒按店里的价目表一口价收费。",
  systemTitles: {
    brakes: "刹车",
    electrical: "电瓶、充电与启动",
    engine: "发动机、冷却与保养",
    suspension: "悬挂与传动",
  },
  jobNames: {
    frontPads: "换前刹车片",
    rearPads: "换后刹车片",
    frontRotors: "换前刹车盘",
    rearRotors: "换后刹车盘",
    brakeBleed: "刹车油排气",
    masterCylinder: "换刹车总泵",
    battery: "换 12V 电瓶",
    alternator: "换发电机",
    starter: "换启动马达",
    thermostat: "换节温器",
    coolantTank: "换冷却液副水箱",
    oxygenSensor: "换氧传感器",
    evapCanister: "换碳罐",
    fuelCap: "换油箱盖",
    driveBelt: "换发动机皮带",
    timingBelt: "换正时皮带",
    acCompressor: "换空调压缩机",
    cabinFilter: "换空调滤芯",
    frontStruts: "换前减震器总成",
    rearStruts: "换后减震器总成",
    strutMount: "换减震顶胶",
    swayBarLinks: "换平衡杆连杆",
    cvAxle: "换半轴",
  },
  columns: { job: "项目", vehicle: "车型", laborTime: "标准工时", parts: "配件", total: "总价" },
  hoursUnit: "小时",
  methodTitle: "这些价格是怎么来的",
  methodItems: [
    "每个总价都是配件加工时，未含 GST 和 PST。",
    "工时取自行业标准工时手册对该车型、该项目的规定，不是按秒表计时。配件按 WorldPac 标价；同一配件有多个选择时，区间从最便宜到最贵。",
    "报价来自 SPEEDX AUTO 网上估价助手 2026 年 10 月 11–12 日的结果。总价上下各放宽 10%，和估价助手给客人看的区间一致，因为检查后最终价格可能变化。",
    "换机油、换胎和空调加冷媒按店里公布的一口价。",
    "配件价格会变动，开工前我们会按您的车确认具体报价。",
  ],
  faqTitle: "维修价格常见问题",
  faqs: [
    {
      question: "温哥华换前刹车片大概多少钱？",
      answer: "在列治文的 SPEEDX AUTO，我们报过价的 2015–2020 年车型换前刹车片为 {frontPads}，含配件和工时，税前价格。差别主要在车型和所选刹车片。",
    },
    {
      question: "换汽车电瓶要多少钱？",
      answer: "按我们报过价的汽油车和 SUV，含安装为 {battery}，取决于电瓶规格和类型。2010 款丰田普锐斯混动车的 12V 辅助电瓶为 {hybridBattery}。",
    },
    {
      question: "列治文换机油多少钱？",
      answer: "普通轿车或小 SUV 用普通机油 {oilCar}，高级机油 {oilCarPremium}，含机油和机滤。大型 SUV 和皮卡 {oilLarge}。",
    },
    {
      question: "为什么同一个项目，不同车价格差这么多？",
      answer: "工时手册给每款车规定的工时不同，配件价格也不同。例如换发电机，2020 丰田 RAV4 标准工时 0.8 小时，2019 福特翼虎要 4.0 小时。",
    },
    {
      question: "这些价格含税吗？",
      answer: "不含。所有价格都未含 GST 和 PST。",
    },
    {
      question: "能查到我自己这辆车的价格吗？",
      answer: "可以。维修页上的估价助手会查询您的车型，几分钟内给出价格区间。最终报价以到店检查为准。",
    },
  ],
  ctaTitle: "查一查您的车要多少钱",
  ctaBody: "用估价助手查询，或通过 WhatsApp、微信发送车型和问题。",
  estimateLabel: "打开估价助手",
  linkLabel: "查看完整价格参考",
};

export const zhTWPriceGuide: PriceGuideCopy = {
  metaTitle: "溫哥華維修價錢參考 2026：煞車片、電池、避震",
  metaDescription:
    "列治文車房的 2026 年真實維修價錢：煞車片、電池、發電機、避震器、換機油等，按車款列出，連零件及工時，未連稅價錢。",
  eyebrow: "價錢參考",
  title: "大溫哥華汽車維修價錢參考（2026）",
  navLabel: "價錢參考",
  summary:
    "以下是列治文 SPEEDX AUTO 的真實維修價錢：{jobs} 個常見項目、共 {quotes} 份報價，車款為 2012–2020 年，按行業標準工時及 WorldPac 零件標價計算。更換前煞車片 {frontPads}，更換 12V 電池 {battery}，均連零件及工時，未連稅價錢。實際價錢視乎車款和所選零件。",
  lastUpdated: "報價日期：2026 年 10 月 11–12 日",
  flatTitle: "一口價項目",
  flatIntro: "換機油、換胎和冷氣加雪種按車房價目表一口價收費。",
  systemTitles: {
    brakes: "煞車",
    electrical: "電池、充電及啟動",
    engine: "引擎、冷卻及保養",
    suspension: "避震及傳動",
  },
  jobNames: {
    frontPads: "更換前煞車片",
    rearPads: "更換後煞車片",
    frontRotors: "更換前煞車碟",
    rearRotors: "更換後煞車碟",
    brakeBleed: "煞車油排氣",
    masterCylinder: "更換煞車總泵",
    battery: "更換 12V 電池",
    alternator: "更換發電機",
    starter: "更換摩打（啟動馬達）",
    thermostat: "更換節溫器",
    coolantTank: "更換水箱副水壺",
    oxygenSensor: "更換含氧感應器",
    evapCanister: "更換碳罐",
    fuelCap: "更換油箱蓋",
    driveBelt: "更換引擎皮帶",
    timingBelt: "更換正時皮帶（坑帶）",
    acCompressor: "更換冷氣壓縮機",
    cabinFilter: "更換冷氣濾網",
    frontStruts: "更換前避震器總成",
    rearStruts: "更換後避震器總成",
    strutMount: "更換避震頂膠",
    swayBarLinks: "更換平衡桿連桿",
    cvAxle: "更換半軸",
  },
  columns: { job: "項目", vehicle: "車款", laborTime: "標準工時", parts: "零件", total: "總價" },
  hoursUnit: "小時",
  methodTitle: "這些價錢從何而來",
  methodItems: [
    "每個總價都是零件加工時，未連 GST 及 PST。",
    "工時取自行業標準工時手冊對該車款、該項目的訂明工時，並非按秒錶計時。零件按 WorldPac 標價；同一零件有多個選擇時，範圍由最平到最貴。",
    "報價來自 SPEEDX AUTO 網上估價助手 2026 年 10 月 11–12 日的結果。總價上下各放寬 10%，與估價助手給客人看的範圍一致，因為檢查後最終價錢可能有變。",
    "換機油、換胎和冷氣加雪種按車房公布的一口價。",
    "零件價錢會變動，開工前我們會按您的車確認具體報價。",
  ],
  faqTitle: "維修價錢常見問題",
  faqs: [
    {
      question: "溫哥華換前煞車片大概要多少錢？",
      answer: "在列治文的 SPEEDX AUTO，我們報過價的 2015–2020 年車款更換前煞車片為 {frontPads}，連零件及工時，未連稅。差別主要在車款和所選煞車片。",
    },
    {
      question: "換汽車電池要多少錢？",
      answer: "按我們報過價的汽油車及 SUV，連安裝為 {battery}，視乎電池規格和類型。2010 年 Toyota Prius 混能車的 12V 輔助電池為 {hybridBattery}。",
    },
    {
      question: "列治文換機油要多少錢？",
      answer: "一般轎車或小型 SUV 用普通機油 {oilCar}，高級機油 {oilCarPremium}，已包機油及機油格。大型 SUV 和皮卡 {oilLarge}。",
    },
    {
      question: "為甚麼同一個項目，不同車價錢差這麼多？",
      answer: "工時手冊為每款車訂明的工時不同，零件價錢亦不同。例如更換發電機，2020 Toyota RAV4 標準工時 0.8 小時，2019 Ford Escape 要 4.0 小時。",
    },
    {
      question: "這些價錢包稅嗎？",
      answer: "不包。所有價錢都未連 GST 及 PST。",
    },
    {
      question: "可以查到我自己部車的價錢嗎？",
      answer: "可以。維修頁上的估價助手會查詢您的車款，幾分鐘內給出價錢範圍。最終報價以到店檢查為準。",
    },
  ],
  ctaTitle: "查一查您的車要多少錢",
  ctaBody: "用估價助手查詢，或透過 WhatsApp、微信傳送車款和問題。",
  estimateLabel: "開啟估價助手",
  linkLabel: "查看完整價錢參考",
};
