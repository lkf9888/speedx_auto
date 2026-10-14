/**
 * Facebook / Instagram ad landing pages (/<locale>/lp/<slug>). Text in braces,
 * such as {tireUpTo18}, is filled from FLAT_PRICES and the price guide data
 * when the page renders, so offers always match the shop's prices.
 */
import type { RepairLandingCopy } from "@/i18n/types";
import type { RepairLandingSlug } from "@/lib/site-routes";

type LandingSet = Record<RepairLandingSlug, RepairLandingCopy>;

export const enRepairLanding: LandingSet = {
  "winter-tires": {
    metaTitle: "Winter Tire Change from {tireUpTo18} a Tire + Free Brake Check",
    metaDescription:
      "Winter tire changes from {tireUpTo18} per tire, with a free brake check, at SPEEDX AUTO in Richmond, BC, near YVR. Book by WhatsApp. English, Cantonese and Mandarin spoken.",
    eyebrow: "Winter tire season",
    title: "Winter tires on, from {tireUpTo18} a tire",
    subtitle:
      "From October 1 to March 31, most BC highways require winter tires or chains. Book your tire change at our Richmond shop near YVR, and we check your brakes for free while the wheels are off.",
    highlights: [
      { value: "{tireUpTo18}", label: "per tire, up to 18 in." },
      { value: "{tireOver18}", label: "per tire, over 18 in." },
      { value: "Free", label: "brake check with your tire change" },
    ],
    priceTitle: "Tire change prices",
    priceRows: [
      { label: "All-season or winter, up to 18 in.", price: "{tireUpTo18} per tire" },
      { label: "All-season or winter, over 18 in.", price: "{tireOver18} per tire" },
      { label: "Run-flat", price: "{tireRunFlat} per tire" },
      { label: "AT / RT / MT, any size", price: "{tireOffRoad} per tire" },
    ],
    pointsTitle: "While your car is in",
    points: [
      {
        title: "Why winter tires",
        body: "Below about 7 °C, winter tires grip better on cold, wet roads than all-seasons, and most BC highways require them from October 1.",
      },
      {
        title: "Brakes for the wet season",
        body: "The brake check is free with your tire change: we measure the pads and rotors and tell you what we see. If anything needs work, we quote first. Front pads on most 2015–2020 cars run {frontPads}.",
      },
      {
        title: "Need new tires?",
        body: "We can quote new winter tires, installed. Send your tire size from the sidewall, for example 215/55R17.",
      },
    ],
    stepsTitle: "How to book",
    steps: [
      "WhatsApp us your car and tire size",
      "Pick a time at our Richmond shop",
      "We change the tires and check your brakes for free",
    ],
    trustTitle: "SPEEDX AUTO",
    trust: [
      "2980 Number 3 Road, Richmond, near YVR",
      "English, Cantonese, and Mandarin spoken",
      "Mon–Sat 10 AM–6:30 PM, appointments required",
      "The same shop maintains our own 100+ vehicle rental fleet",
    ],
    note: "Prices before tax. Tire change prices cover the work; tires are extra. Vehicles with V8 or larger engines, or that sold new above $120,000, are quoted by the team. The brake check is free with a tire change; any brake repair is quoted before we start.",
    ctaTitle: "Book your tire change",
    ctaBody: "Message us your car and tire size on WhatsApp, or call the shop.",
    whatsappText: "Hi SPEEDX AUTO, I'd like to book a winter tire change. My car: ",
    whatsappLabel: "Book on WhatsApp",
    learnMoreLabel: "See all maintenance prices",
  },
  "tesla-ev": {
    metaTitle: "Independent Tesla Repair in Richmond, BC",
    metaDescription:
      "Tesla and EV repair at SPEEDX AUTO in Richmond near YVR: battery checks, drive motor repair, fault codes, brakes, suspension and tires. Book by WhatsApp.",
    eyebrow: "Tesla and electric vehicles",
    title: "Independent Tesla repair in Richmond",
    subtitle:
      "Battery checks, drive motor repair, fault codes, brakes, suspension, and tires at our Richmond shop near YVR. Send your model and a photo of the alert, and we will tell you the next step.",
    highlights: [
      { value: "{tireUpTo18}", label: "Tesla tire change, per tire" },
      { value: "{acR1234yf}", label: "A/C recharge, R-1234yf" },
      { value: "3", label: "languages: English, 粵語, 普通话" },
    ],
    priceTitle: "Posted prices",
    priceRows: [
      { label: "Tire change, up to 18 in.", price: "{tireUpTo18} per tire" },
      { label: "Tire change, over 18 in.", price: "{tireOver18} per tire" },
      { label: "A/C recharge, R-1234yf", price: "{acR1234yf}" },
      { label: "Repairs and diagnosis", price: "Quoted before work starts" },
    ],
    pointsTitle: "What we work on",
    points: [
      {
        title: "High-voltage battery checks",
        body: "We check the battery's condition and related fault codes, then explain what we found and your options before any repair.",
      },
      {
        title: "Drive motor repair",
        body: "Whining, grinding, or clunking from the drive unit when you accelerate or slow down? We diagnose it and quote the repair.",
      },
      {
        title: "Brakes that sit too long",
        body: "Regenerative braking means the pads work less, so calipers can seize or corrode in Vancouver's wet weather. We clean, check, and repair EV brakes.",
      },
      {
        title: "Tires, suspension, maintenance",
        body: "EVs are heavy and wear tires quickly. Tire changes start at {tireUpTo18} a tire; suspension and maintenance are quoted before we start.",
      },
    ],
    stepsTitle: "How it works",
    steps: [
      "Send your model, year, mileage, and a photo of any alert",
      "We reply with the next step",
      "Bring the car to our Richmond shop at the booked time",
    ],
    trustTitle: "SPEEDX AUTO",
    trust: [
      "2980 Number 3 Road, Richmond, near YVR",
      "English, Cantonese, and Mandarin spoken",
      "Mon–Sat 10 AM–6:30 PM, appointments required",
      "Other EV brands: send the make and model first",
    ],
    note: "Prices before tax. Never open or work on high-voltage parts yourself.",
    ctaTitle: "Tell us about your Tesla",
    ctaBody: "Send the model, year, and the problem on WhatsApp, or call the shop.",
    whatsappText: "Hi SPEEDX AUTO, I have a Tesla. Model and year: . Problem: ",
    whatsappLabel: "Message us on WhatsApp",
    learnMoreLabel: "Read the full Tesla and EV repair guide",
  },
};

export const zhCNRepairLanding: LandingSet = {
  "winter-tires": {
    metaTitle: "列治文换冬季胎 每条 {tireUpTo18} 起 免费检查刹车",
    metaDescription: "SPEEDX AUTO 列治文车间换冬季胎每条 {tireUpTo18} 起，免费检查刹车，靠近温哥华机场。WhatsApp 预约，普通话、粤语、英语服务。",
    eyebrow: "冬季胎季节",
    title: "换冬季胎，每条 {tireUpTo18} 起",
    subtitle: "每年 10 月 1 日至 3 月 31 日，BC 省大部分高速公路要求使用冬季胎或携带防滑链。到我们靠近 YVR 的列治文车间换胎，拆轮子时免费帮您检查刹车。",
    highlights: [
      { value: "{tireUpTo18}", label: "每条，18 寸及以下" },
      { value: "{tireOver18}", label: "每条，18 寸以上" },
      { value: "免费", label: "换胎时检查刹车" },
    ],
    priceTitle: "换胎价格",
    priceRows: [
      { label: "四季胎或雪胎，18 寸及以下", price: "每条 {tireUpTo18}" },
      { label: "四季胎或雪胎，18 寸以上", price: "每条 {tireOver18}" },
      { label: "防爆胎", price: "每条 {tireRunFlat}" },
      { label: "AT / RT / MT 越野胎，任何尺寸", price: "每条 {tireOffRoad}" },
    ],
    pointsTitle: "车在店里的时候",
    points: [
      { title: "为什么要换冬季胎", body: "气温低于约 7 °C 时，冬季胎在湿冷路面上的抓地力比四季胎好，而且 BC 省大部分高速公路从 10 月 1 日起要求使用。" },
      { title: "雨季更要注意刹车", body: "换胎时免费检查刹车：测量刹车片和刹车盘，告诉您实际情况。需要维修的话先报价再开工。多数 2015–2020 年车型换前刹车片 {frontPads}。" },
      { title: "需要买新胎？", body: "我们可以报价新冬季胎（含安装）。请发送轮胎侧面的尺寸，例如 215/55R17。" },
    ],
    stepsTitle: "怎么预约",
    steps: ["WhatsApp 发送车型和轮胎尺寸", "约好到列治文车间的时间", "换胎，并免费检查刹车"],
    trustTitle: "SPEEDX AUTO 速驰汽车",
    trust: ["列治文 2980 Number 3 Road，靠近 YVR", "普通话、粤语、英语都可以", "周一至周六 10:00–18:30，需要预约", "自营 100 多辆租车车队，也由这个车间维护"],
    note: "以上为税前价格。换胎价格只含工钱，轮胎另计。V8 及以上发动机、或新车价超过 12 万加元的车辆，由团队单独报价。换胎时检查刹车免费，刹车维修开工前先报价。",
    ctaTitle: "预约换胎",
    ctaBody: "WhatsApp 发送车型和轮胎尺寸，或直接致电车间。",
    whatsappText: "你好 SPEEDX AUTO，我想预约换冬季胎。我的车是：",
    whatsappLabel: "WhatsApp 预约换胎",
    learnMoreLabel: "查看全部保养价格",
  },
  "tesla-ev": {
    metaTitle: "列治文独立特斯拉维修",
    metaDescription: "SPEEDX AUTO 列治文车间维修特斯拉和电动车：电池检测、驱动电机维修、故障码、刹车、悬挂、轮胎。WhatsApp 预约，普通话、粤语服务。",
    eyebrow: "特斯拉与电动车",
    title: "列治文独立特斯拉维修",
    subtitle: "电池检测、驱动电机维修、故障码诊断、刹车、悬挂和轮胎，都在我们靠近 YVR 的列治文车间。发来车型和屏幕警告的照片，我们告诉您下一步怎么做。",
    highlights: [
      { value: "{tireUpTo18}", label: "特斯拉换胎，每条" },
      { value: "{acR1234yf}", label: "空调加冷媒 R-1234yf" },
      { value: "3", label: "种语言：普通话、粤语、英语" },
    ],
    priceTitle: "公开价格",
    priceRows: [
      { label: "换胎，18 寸及以下", price: "每条 {tireUpTo18}" },
      { label: "换胎，18 寸以上", price: "每条 {tireOver18}" },
      { label: "空调加冷媒 R-1234yf", price: "{acR1234yf}" },
      { label: "维修与诊断", price: "开工前报价" },
    ],
    pointsTitle: "我们做什么",
    points: [
      { title: "高压电池检测", body: "检查电池状况和相关故障码，维修前先向您说明结果和可选方案。" },
      { title: "驱动电机维修", body: "加速或减速时驱动电机有啸叫、摩擦或咯噔声？我们诊断后给出维修报价。" },
      { title: "刹车用得少反而容易坏", body: "动能回收让刹车片用得少，在温哥华潮湿的天气里，卡钳容易卡滞或锈蚀。我们清洁、检查和维修电动车刹车。" },
      { title: "轮胎、悬挂与保养", body: "电动车车重，轮胎磨得快。换胎每条 {tireUpTo18} 起，悬挂和保养项目开工前报价。" },
    ],
    stepsTitle: "流程",
    steps: ["发送车型、年份、里程和屏幕警告的照片", "我们回复下一步怎么做", "按约好的时间把车开到列治文车间"],
    trustTitle: "SPEEDX AUTO 速驰汽车",
    trust: ["列治文 2980 Number 3 Road，靠近 YVR", "普通话、粤语、英语都可以", "周一至周六 10:00–18:30，需要预约", "其他品牌电动车请先发送品牌和车型"],
    note: "以上为税前价格。千万不要自己打开或处理高压部件。",
    ctaTitle: "说说您的特斯拉",
    ctaBody: "WhatsApp 发送车型、年份和问题，或直接致电车间。",
    whatsappText: "你好 SPEEDX AUTO，我的车是特斯拉。车型和年份：。问题：",
    whatsappLabel: "WhatsApp 咨询",
    learnMoreLabel: "查看特斯拉与电动车维修详情",
  },
};

export const zhTWRepairLanding: LandingSet = {
  "winter-tires": {
    metaTitle: "列治文換冬季胎 每條 {tireUpTo18} 起 免費檢查煞車",
    metaDescription: "SPEEDX AUTO 列治文車房換冬季胎每條 {tireUpTo18} 起，免費檢查煞車，鄰近溫哥華機場。WhatsApp 預約，粵語、普通話、英語服務。",
    eyebrow: "冬季胎季節",
    title: "換冬季胎，每條 {tireUpTo18} 起",
    subtitle: "每年 10 月 1 日至 3 月 31 日，BC 省大部分高速公路要求使用冬季胎或攜帶防滑鏈。到我們鄰近 YVR 的列治文車房換胎，拆輪時免費幫您檢查煞車。",
    highlights: [
      { value: "{tireUpTo18}", label: "每條，18 吋或以下" },
      { value: "{tireOver18}", label: "每條，18 吋以上" },
      { value: "免費", label: "換胎時檢查煞車" },
    ],
    priceTitle: "換胎價錢",
    priceRows: [
      { label: "四季胎或雪胎，18 吋或以下", price: "每條 {tireUpTo18}" },
      { label: "四季胎或雪胎，18 吋以上", price: "每條 {tireOver18}" },
      { label: "防爆胎", price: "每條 {tireRunFlat}" },
      { label: "AT / RT / MT 越野胎，任何尺寸", price: "每條 {tireOffRoad}" },
    ],
    pointsTitle: "車在店內的時候",
    points: [
      { title: "為甚麼要換冬季胎", body: "氣溫低於約 7 °C 時，冬季胎在濕冷路面上的抓地力比四季胎好，而且 BC 省大部分高速公路由 10 月 1 日起要求使用。" },
      { title: "雨季更要留意煞車", body: "換胎時免費檢查煞車：量度煞車片和煞車碟，告訴您實際情況。需要維修的話先報價再開工。大部分 2015–2020 年車款換前煞車片 {frontPads}。" },
      { title: "需要買新胎？", body: "我們可以報價新冬季胎（連安裝）。請傳送輪胎側面的尺寸，例如 215/55R17。" },
    ],
    stepsTitle: "怎樣預約",
    steps: ["WhatsApp 傳送車款和輪胎尺寸", "約好到列治文車房的時間", "換胎，並免費檢查煞車"],
    trustTitle: "SPEEDX AUTO 速馳汽車",
    trust: ["列治文 2980 Number 3 Road，鄰近 YVR", "粵語、普通話、英語都可以", "週一至週六 10:00–18:30，須預約", "自營 100 多部租車車隊，亦由這個車房保養"],
    note: "以上為未連稅價錢。換胎價錢只計工錢，輪胎另計。V8 或以上引擎、或新車價超過 12 萬加元的車輛，由團隊另行報價。換胎時檢查煞車免費，煞車維修開工前先報價。",
    ctaTitle: "預約換胎",
    ctaBody: "WhatsApp 傳送車款和輪胎尺寸，或直接致電車房。",
    whatsappText: "你好 SPEEDX AUTO，我想預約換冬季胎。我部車是：",
    whatsappLabel: "WhatsApp 預約換胎",
    learnMoreLabel: "查看全部保養價錢",
  },
  "tesla-ev": {
    metaTitle: "列治文獨立 Tesla 維修",
    metaDescription: "SPEEDX AUTO 列治文車房維修 Tesla 及電動車：電池檢測、電動馬達維修、故障碼、煞車、避震、輪胎。WhatsApp 預約，粵語、普通話服務。",
    eyebrow: "Tesla 及電動車",
    title: "列治文獨立 Tesla 維修",
    subtitle: "電池檢測、電動馬達維修、故障碼診斷、煞車、避震和輪胎，都在我們鄰近 YVR 的列治文車房。傳來車款和屏幕警告的相片，我們告訴您下一步怎樣做。",
    highlights: [
      { value: "{tireUpTo18}", label: "Tesla 換胎，每條" },
      { value: "{acR1234yf}", label: "冷氣加雪種 R-1234yf" },
      { value: "3", label: "種語言：粵語、普通話、英語" },
    ],
    priceTitle: "公開價錢",
    priceRows: [
      { label: "換胎，18 吋或以下", price: "每條 {tireUpTo18}" },
      { label: "換胎，18 吋以上", price: "每條 {tireOver18}" },
      { label: "冷氣加雪種 R-1234yf", price: "{acR1234yf}" },
      { label: "維修及診斷", price: "開工前報價" },
    ],
    pointsTitle: "我們做甚麼",
    points: [
      { title: "高壓電池檢測", body: "檢查電池狀況和相關故障碼，維修前先向您說明結果和可選方案。" },
      { title: "電動馬達維修", body: "加速或減速時電動馬達有尖嘯、磨擦或咯咯聲？我們診斷後給出維修報價。" },
      { title: "煞車用得少反而易壞", body: "動能回收令煞車片用得少，在溫哥華潮濕的天氣下，卡鉗容易卡死或生鏽。我們清潔、檢查和維修電動車煞車。" },
      { title: "輪胎、避震及保養", body: "電動車車重，輪胎磨得快。換胎每條 {tireUpTo18} 起，避震和保養項目開工前報價。" },
    ],
    stepsTitle: "流程",
    steps: ["傳送車款、年份、里程和屏幕警告的相片", "我們回覆下一步怎樣做", "按約好的時間把車駛到列治文車房"],
    trustTitle: "SPEEDX AUTO 速馳汽車",
    trust: ["列治文 2980 Number 3 Road，鄰近 YVR", "粵語、普通話、英語都可以", "週一至週六 10:00–18:30，須預約", "其他品牌電動車請先傳送品牌和車款"],
    note: "以上為未連稅價錢。切勿自行打開或處理高壓部件。",
    ctaTitle: "講講您部 Tesla",
    ctaBody: "WhatsApp 傳送車款、年份和問題，或直接致電車房。",
    whatsappText: "你好 SPEEDX AUTO，我部車是 Tesla。車款和年份：。問題：",
    whatsappLabel: "WhatsApp 查詢",
    learnMoreLabel: "查看 Tesla 及電動車維修詳情",
  },
};
