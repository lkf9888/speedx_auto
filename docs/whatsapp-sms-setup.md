# WhatsApp + 短信：开通步骤（第一期）

代码已经写好，但在下面的设置做完之前**什么都不会发出去**：工作台里的"直接发给客人"会显示"WhatsApp 和短信都还没设置好"。
密钥一律直接填进 Railway 的环境变量页面，不要发给任何人，也不要写进聊天或文件。

## 一、WhatsApp（Meta 官方 Cloud API）

1. 打开 Meta Business Suite（business.facebook.com），用公司账号登录，完成**商家认证**（要营业执照等公司资料，几天审核）。
2. 在 developers.facebook.com 建一个 App，类型选 Business，添加产品 **WhatsApp**。
3. 准备一个**专用手机号**（不能已经在普通 WhatsApp 或 WhatsApp Business App 上注册；新买一个号最省事）。在 WhatsApp → 开始使用 里添加这个号，用短信或语音验证。
4. 建**系统用户**（Business Settings → 用户 → 系统用户），给它这个 App 和 WhatsApp 账户的权限（`whatsapp_business_messaging`、`whatsapp_business_management`），生成**永久访问令牌**。
5. 记下四样东西：
   - 访问令牌 → `WHATSAPP_TOKEN`
   - 手机号 ID（WhatsApp → API 设置里，一串数字）→ `WHATSAPP_PHONE_NUMBER_ID`
   - App 密钥（App 设置 → 基本）→ `WHATSAPP_APP_SECRET`
   - 自己随便编一个验证字符串 → `WHATSAPP_VERIFY_TOKEN`
6. 配置 Webhook（WhatsApp → 配置）：
   - 回调网址：`https://speedxrental.com/api/whatsapp/webhook`
   - 验证令牌：上面的 `WHATSAPP_VERIFY_TOKEN`
   - 订阅字段：勾 **messages**
   （Meta 点验证时会访问这个网址，所以要先把环境变量填好并部署，再点验证。）
7. 建一个**消息模板**（WhatsApp → 消息模板），用来在客人 24 小时内没回复过时发第一条：
   - 名称：`reply_to_inquiry`，类别：**Utility（实用）**，语言：English（也可以另建中文版，第一期只用一个）
   - 正文（变量不能放在开头或结尾，示例值要填）：
     `Hi {{1}}, this is SPEEDX AUTO following up on your online repair estimate. {{2}} Reply to this message any time. 您好，这是 SPEEDX AUTO 对您网站维修估价的跟进。直接回复即可。`
   - `{{1}}` 示例填 Amy，`{{2}}` 示例填 Your rotors arrive tomorrow and we can do the job Monday.
   - 审核通过后，名称填 `WHATSAPP_TEMPLATE_NAME`，语言代码填 `WHATSAPP_TEMPLATE_LANG`（English 是 `en`）。

## 二、短信（Twilio，没有 WhatsApp 的客人走这里）

1. 注册 twilio.com，买一个加拿大的、支持短信的号码（或建 Messaging Service）。Twilio 可能要求登记短信用途，按它页面提示做。
2. 号码的"收到短信时"设置为 Webhook，方法 POST，网址：`https://speedxrental.com/api/sms/webhook`（必须一字不差，签名校验用这个网址）。
3. 记下：Account SID → `TWILIO_ACCOUNT_SID`；Auth Token → `TWILIO_AUTH_TOKEN`；发信号码（如 `+16045550000`，或 Messaging Service 的 `MG…`）→ `TWILIO_FROM`。

## 三、填进 Railway

项目 sparkling-grace → 服务 speedx_auto → Variables，添加：

| 变量 | 内容 |
| --- | --- |
| `WHATSAPP_TOKEN` | 系统用户令牌 |
| `WHATSAPP_PHONE_NUMBER_ID` | 手机号 ID |
| `WHATSAPP_APP_SECRET` | App 密钥 |
| `WHATSAPP_VERIFY_TOKEN` | 你编的验证字符串 |
| `WHATSAPP_TEMPLATE_NAME` | `reply_to_inquiry` |
| `WHATSAPP_TEMPLATE_LANG` | `en` |
| `TWILIO_ACCOUNT_SID` | Twilio SID |
| `TWILIO_AUTH_TOKEN` | Twilio Token |
| `TWILIO_FROM` | 发信号码 |

保存后 Railway 会重新部署。也可以只先开通其中一条：只设短信，工作台就只发短信；只设 WhatsApp，没有 WhatsApp 的客人就发不了。

## 四、Cloudflare

speedxrental.com 走 Cloudflare 代理。如果 Meta 或 Twilio 的回调被拦（Bot Fight Mode / WAF），在 Cloudflare 里给这两个路径加一条"跳过"规则：`/api/whatsapp/webhook`、`/api/sms/webhook`。
这两个路径在公开域名上，不在 Access 保护的 repair 子域名里，所以**不需要**改 Access。

## 五、开通后怎么试

1. 在工作台打开一个留了电话的网站咨询（可以是你自己用手机号留的测试咨询）。
2. 下面"直接发给客人"会说明这条会怎么发（WhatsApp 窗口 / 先发模板 / 短信）。写一句话，点"确认发送"。
3. 用手机回复，应该几秒内出现在这段对话里，标着"客人回复 · WhatsApp"。
4. 回复 STOP，再发一条，应该被拒绝并提示"客人回复过退订"。

## 规则和费用提醒

- 每一条都要员工点"确认发送"，AI 不会自己给客人发。
- 客人先回复后 24 小时内，WhatsApp 可以自由聊天；超过 24 小时只能先发模板消息。
- 加拿大号码模板消息每条约 US$0.003–0.025（以 Meta 官方价目表为准，不同类别不同）；客人先发起的对话窗口内基本免费。短信按 Twilio 价目。
- 客人回 STOP/退订，这个号码以后不会再收到我们的任何消息（按号码记，不按对话记）。
- 网站留电话的表单已加上"可能通过电话、WhatsApp 或短信联系，回复 STOP 退订"的同意说明，并记录客人留号码的时间。
