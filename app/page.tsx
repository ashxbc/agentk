import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import SocialProofFlow from "@/components/SocialProofFlow";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      <Navbar />

      <main className="relative z-10 w-full max-w-[1435px] min-h-[calc(100vh-80px)] mx-auto pt-16 flex flex-col justify-center">
        <Hero />
      </main>

      <SocialProofFlow />
      <Pricing />
      <FAQ />
      <Footer />
    </div>
  );
}
