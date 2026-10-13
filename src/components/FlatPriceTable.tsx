import type { RepairFlatPriceLabels } from "@/i18n/types";
import { FLAT_PRICES } from "@/lib/repair-chat/flat-price";

const usd = (amount: number) => `$${amount}`;

/** The shop's posted flat prices, worded for the page. Amounts match the estimate assistant. */
export function flatPriceRows(labels: RepairFlatPriceLabels) {
  const { oil, tirePerWheel, acRecharge } = FLAT_PRICES;
  const pair = (a: string, aPrice: number, b: string, bPrice: number) =>
    `${a} ${usd(aPrice)} · ${b} ${usd(bPrice)}`;
  return [
    { service: labels.oilCar, price: pair(labels.regularOil, oil.standard.regular, labels.premiumOil, oil.premium.regular) },
    { service: labels.oilLarge, price: pair(labels.regularOil, oil.standard.large, labels.premiumOil, oil.premium.large) },
    { service: labels.oilEuropean, price: `${labels.oemOil} ${usd(oil.european)}` },
    { service: labels.oilDiesel, price: pair(labels.dieselCar, oil.diesel.car, labels.dieselSuv, oil.diesel.suv) },
    {
      service: labels.tire,
      price: [
        `${labels.tireUpTo18} ${usd(tirePerWheel.up_to_18)}`,
        `${labels.tireOver18} ${usd(tirePerWheel.over_18)}`,
        `${labels.tireRunFlat} ${usd(tirePerWheel.run_flat)}`,
        `${labels.tireOffRoad} ${usd(tirePerWheel.off_road)}`,
      ].join(" · "),
    },
    { service: labels.ac, price: pair(labels.r134a, acRecharge.r134a, labels.r1234yf, acRecharge.r1234yf) },
  ];
}

export function FlatPriceTable({ labels }: { labels: RepairFlatPriceLabels }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink-100">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink-100 text-xs uppercase tracking-wider text-ink-400">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold sm:px-5">{labels.columns.service}</th>
            <th scope="col" className="px-4 py-3 font-semibold sm:px-5">{labels.columns.price}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {flatPriceRows(labels).map((row) => (
            <tr key={row.service}>
              <th scope="row" className="px-4 py-4 align-top font-semibold text-ink-900 sm:px-5">{row.service}</th>
              <td className="px-4 py-4 tabular-nums leading-6 text-ink-600 sm:px-5">{row.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
