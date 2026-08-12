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
  metaTitle: "Auto Repair in Richmond near YVR",
  metaDescription:
    "Mechanical inspections, maintenance, brakes, diagnostics, suspension and steering service in Richmond for Metro Vancouver drivers.",
  eyebrow: "Mechanical repair",
  title: "Auto Repair in Richmond, BC",
  summary:
    "SPEEDX AUTO provides mechanical inspection and repair from our Richmond shop near Vancouver International Airport. We help Metro Vancouver drivers with scheduled maintenance, brake concerns, warning-light diagnostics, and suspension or steering symptoms. Contact us with the vehicle year, make, model, and concern so we can confirm the appropriate inspection and scheduling.",
  servicesTitle: "Mechanical services",
  servicesIntro:
    "Choose the service closest to your concern. A physical inspection determines the final recommendation and quote.",
  whyTitle: "A practical inspection-first approach",
  whyItems: [
    {
      title: "Clear starting point",
      body: "Tell us the vehicle and symptoms; we will identify the appropriate inspection rather than guessing from a message.",
    },
    {
      title: "Fleet-informed operations",
      body: "Our shop supports both local drivers and vehicles managed in SPEEDX AUTO's rental fleet.",
    },
    {
      title: "Direct contact",
      body: "Reach the team by WhatsApp, phone, or WeChat before visiting the Richmond shop.",
    },
  ],
  serviceAreaTitle: "Richmond and Metro Vancouver",
  serviceAreaBody:
    "Our mechanical shop is in Richmond near YVR and serves drivers from Richmond and across Metro Vancouver. Please contact us first to confirm scheduling and whether the requested work fits our current service scope.",
  faqTitle: "Auto repair questions",
  faqs: [
    {
      question: "Can you diagnose my vehicle from a message?",
      answer:
        "Messages help us select a starting inspection, but a final diagnosis and quote require checking the vehicle.",
    },
    {
      question: "What information should I send?",
      answer:
        "Send the year, make, model, mileage, warning lights, symptoms, and when the issue occurs. Photos or a short video may also help with intake.",
    },
    {
      question: "Do I need to contact you before arriving?",
      answer:
        "Yes. Contact us by WhatsApp, phone, or WeChat so the team can confirm timing and the appropriate service.",
    },
  ],
  ctaTitle: "Tell us what your vehicle is doing",
  ctaBody:
    "Send the vehicle details and symptoms by WhatsApp or WeChat, or call SPEEDX AUTO to discuss the next inspection step.",
  lastUpdated: "Updated August 11, 2026",
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
  metaTitle: "列治文 YVR 附近汽车维修",
  metaDescription: "面向列治文及大温车主的保养、刹车、故障诊断、悬挂与转向检查服务。",
  eyebrow: "机械维修",
  title: "列治文汽车维修服务",
  summary:
    "SPEEDX AUTO 在列治文、靠近温哥华国际机场的自营车间提供机械检查与维修，服务列治文及大温地区车主。我们处理定期保养、刹车异常、故障灯诊断，以及悬挂或转向问题。请发送车辆年份、品牌、型号和症状，我们会先确认合适的检查项目与预约时间。",
  servicesTitle: "机械维修项目",
  servicesIntro: "选择最接近车辆问题的项目；最终建议与报价必须以实车检查结果为准。",
  whyTitle: "先检查，再给建议",
  whyItems: [
    { title: "明确起点", body: "先了解车辆与症状，再安排对应检查，不通过聊天猜测故障。" },
    { title: "车队运营经验", body: "车间同时支持本地车主和 SPEEDX AUTO 托管车队的车辆。" },
    { title: "直接联系", body: "到店前可通过 WhatsApp、电话或微信直接联系团队。" },
  ],
  serviceAreaTitle: "列治文及大温地区",
  serviceAreaBody:
    "机械维修车间位于列治文、靠近 YVR，服务列治文及大温地区车主。请先联系我们，确认预约时间以及所需工作是否属于当前服务范围。",
  faqTitle: "汽车维修常见问题",
  faqs: [
    { question: "可以通过消息直接诊断吗？", answer: "消息可帮助选择检查起点，但最终诊断与报价需要检查实车。" },
    { question: "联系时应提供什么？", answer: "请提供年份、品牌、型号、里程、故障灯、症状及出现条件；照片或短视频也有助于接车。" },
    { question: "到店前需要预约吗？", answer: "需要。请通过 WhatsApp、电话或微信确认时间和检查项目。" },
  ],
  ctaTitle: "告诉我们车辆出现了什么情况",
  ctaBody: "通过 WhatsApp 或微信发送车辆资料和症状，或致电讨论下一步检查。",
  lastUpdated: "更新于 2026 年 8 月 11 日",
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

export const zhTWAutoRepair: AutoRepairCopy = translateRepairCopy({
  ...zhCNAutoRepair,
  metaTitle: "列治文 YVR 附近汽車維修",
  title: "列治文汽車維修服務",
  serviceAreaTitle: "列治文及大溫地區",
  serviceAreaBody:
    "機械維修車間位於列治文、靠近 YVR，服務列治文及大溫地區車主。請先聯絡我們，確認預約時間以及所需工作是否屬於目前服務範圍。",
  lastUpdated: "更新於 2026 年 8 月 11 日",
});
