"use client";

/**
 * Supa AI — FAQ accordion section.
 *
 * Each FAQ renders in an Accordion item with a clickable header + chevron
 * rotation. The accordions are `type="single"` so only one is open at a
 * time — keeps the section tidy.
 *
 * @module @/components/marketing/sections/faq
 */
import * as React from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQS } from "../marketing-data";

export function FaqSection() {
  return (
    <section
      className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 lg:px-8"
      aria-labelledby="faq-headline"
    >
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-600">
          Questions &amp; answers
        </p>
        <h2
          id="faq-headline"
          className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
        >
          Frequently asked
        </h2>
      </div>

      <Accordion type="single" collapsible className="mt-8">
        {FAQS.map((faq, idx) => (
          <AccordionItem key={faq.question} value={`item-${idx}`}>
            <AccordionTrigger className="text-left text-base font-medium">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
