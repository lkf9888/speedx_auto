"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

type Step = { title: string; body: string };

const IMAGES = [
  "/images/process/step_1.png",
  "/images/process/step_2.png",
  "/images/process/step_3.png",
  "/images/process/step_4.png",
];

const ROTATE_MS = 5000;

export function ProcessCarousel({
  eyebrow,
  title,
  subtitle,
  steps,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  steps: Step[];
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (paused) return;
    intervalRef.current = setInterval(() => {
      setActive((i) => (i + 1) % steps.length);
    }, ROTATE_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paused, steps.length]);

  const goTo = (i: number) => {
    setActive(i);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // resume auto-rotation after a short pause
    setPaused(true);
    setTimeout(() => setPaused(false), 8000);
  };

  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
            {eyebrow}
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-lg text-ink-500">{subtitle}</p>
        </div>

        <div
          className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-xl shadow-brand-900/5"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="grid md:grid-cols-2">
            {/* Image stack */}
            <div className="relative aspect-[3/2] md:aspect-auto md:min-h-[420px] bg-gradient-to-br from-brand-50 to-white">
              {IMAGES.map((src, i) => (
                <div
                  key={src}
                  className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                    i === active ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden={i !== active}
                >
                  <Image
                    src={src}
                    alt={steps[i]?.title ?? `Step ${i + 1}`}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover"
                    priority={i === 0}
                  />
                </div>
              ))}
              {/* Step counter pill */}
              <div className="absolute left-4 top-4 rounded-full bg-ink-900/80 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                {active + 1} / {steps.length}
              </div>
            </div>

            {/* Text stack */}
            <div className="relative flex flex-col justify-between p-8 sm:p-10">
              <div className="relative min-h-[180px]">
                {steps.map((step, i) => (
                  <div
                    key={i}
                    className={`absolute inset-0 transition-all duration-500 ${
                      i === active
                        ? "translate-y-0 opacity-100"
                        : i < active
                          ? "-translate-y-2 opacity-0"
                          : "translate-y-2 opacity-0"
                    }`}
                    aria-hidden={i !== active}
                  >
                    <h3 className="text-2xl font-bold text-ink-900 sm:text-3xl">
                      {step.title}
                    </h3>
                    <p className="mt-4 text-base leading-relaxed text-ink-500 sm:text-lg">
                      {step.body}
                    </p>
                  </div>
                ))}
              </div>

              {/* Dots + navigation */}
              <div className="mt-8 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {steps.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => goTo(i)}
                      aria-label={`Go to step ${i + 1}`}
                      className={`h-2 rounded-full transition-all ${
                        i === active
                          ? "w-8 bg-brand-600"
                          : "w-2 bg-ink-200 hover:bg-ink-300"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      goTo((active - 1 + steps.length) % steps.length)
                    }
                    aria-label="Previous step"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 text-ink-700 transition-colors hover:border-ink-900 hover:bg-ink-50"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo((active + 1) % steps.length)}
                    aria-label="Next step"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 text-ink-700 transition-colors hover:border-ink-900 hover:bg-ink-50"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
