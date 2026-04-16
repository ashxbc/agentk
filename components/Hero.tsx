export default function Hero() {
  return (
    <section className="relative flex flex-col items-center text-center px-6 max-w-4xl mx-auto pb-20">
      <h1 className="font-headline text-6xl md:text-7xl font-extrabold tracking-tight text-on-surface leading-[1.05] mb-8">
        Your next customer{" "}
        <span className="text-primary-container brush-underline italic">
          just posted
        </span>{" "}
        on Reddit
      </h1>

      <p className="text-xl text-secondary max-w-2xl leading-relaxed mb-10">
        AgentK tracks your keywords across subreddits 24/7 and fires instant Telegram alerts the moment a matching post goes live.
      </p>

      <div className="flex flex-col items-center gap-8 mb-16">
        <a
          href="/dashboard"
          className="creative-gradient text-white px-10 py-5 rounded-lg text-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform active:scale-95 inline-block"
        >
          Start Monitoring Free
        </a>

        <div className="flex items-center gap-2 text-sm font-medium text-tertiary">
          <span className="text-primary-container font-bold">Completely free.</span>{" "}
          No credit card.
        </div>
      </div>
    </section>
  );
}
