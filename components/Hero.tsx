export default function Hero() {
  return (
    <section className="relative flex flex-col items-center text-center px-6 max-w-4xl mx-auto pb-20">
      <h1 className="font-headline text-6xl md:text-7xl font-extrabold tracking-tight text-on-surface leading-[1.05] mb-8">
        Turn conversations into{" "}
        <span className="text-primary-container brush-underline italic">
          paying
        </span>{" "}
        customers
      </h1>

      <p className="text-xl text-secondary max-w-2xl leading-relaxed mb-10">
        Catch people already looking for solutions and respond with context-aware replies that win them.
      </p>

      <div className="flex flex-col items-center gap-8 mb-16">
        <a
          href="/dashboard"
          className="creative-gradient text-white px-10 py-5 rounded-lg text-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform active:scale-95 inline-block"
        >
          Get Started Free
        </a>

        {/* Social Proof */}
        <div className="flex items-center gap-2 text-sm font-medium text-tertiary">
          Join{" "}
          <span className="text-primary-container font-bold">146 founders</span>
          {" "}turning daily conversations into consistent users
        </div>
      </div>
    </section>
  );
}
