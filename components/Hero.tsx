"use client";

export default function Hero() {
  return (
    <section className="relative flex flex-col items-center text-center px-6 max-w-4xl mx-auto pb-20">
      <h1 className="font-headline text-6xl md:text-7xl font-extrabold tracking-tight text-on-surface leading-[1.05] mb-14">
        Find leads on Reddit
        <br />
        <span className="text-primary-container brush-underline italic">
          before anyone else.
        </span>
      </h1>

      <p className="text-xl text-secondary max-w-2xl leading-relaxed mb-10">
        ~2 million people post on Reddit every day.
        <br />
        Some of them are actively looking for what you sell.
        <br />
        AgentK finds those posts and alerts you in minutes. Free, forever.
      </p>

      <div className="flex flex-col items-center gap-8 mb-16">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("openAuthModal", { detail: { view: "signup-email" } }))}
          className="creative-gradient text-white px-10 py-5 rounded-lg text-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform active:scale-95 inline-block"
        >
          Find My First Lead Free
        </button>

        <div className="flex items-center gap-2 text-sm font-medium text-tertiary">
          <span className="text-primary-container font-bold">100% free.</span>{" "}
          No credit card.
        </div>
      </div>
    </section>
  );
}
