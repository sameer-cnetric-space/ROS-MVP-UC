import Image from 'next/image';
import Link from 'next/link';

import { ArrowRight, ChevronRight, LineChart, Shield, Zap } from 'lucide-react';

// Shadcn UI Components
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';

import { withI18n } from '~/lib/i18n/with-i18n';

function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-32">
        {/* Gradient overlays */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 opacity-30" />
          <div className="absolute top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-600/20 blur-[100px]" />
        </div>

        <div className="container relative z-10 mx-auto px-4">
          <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
            <div className="mb-8 animate-pulse">
              <Image
                src="/images/vellora-logo.png"
                alt="VELLORA.AI Logo"
                width={120}
                height={120}
                className="h-auto w-[120px]"
              />
            </div>

            <h1 className="mb-6 text-4xl font-heading tracking-tight md:text-7xl">
              GROWTH VELOCITY
            </h1>

            <p className="mb-10 max-w-3xl text-xl text-white/80 md:text-2xl">
              Speed is the strategy. VELLORA.AI is building the real-time revenue engine for modern GTM teams.
            </p>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Button size="lg" className="bg-white text-black hover:bg-white/90" asChild>
                <Link href="/auth/sign-in">Get Started</Link>
              </Button>
              <Button size="lg" variant="outline" className="group" asChild>
                <Link href="/investors">
                  Learn More
                  <ChevronRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions Section */}
      <section className="bg-black/50 py-20">
        <div className="container mx-auto px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-heading md:text-4xl">Our Solutions</h2>
            <p className="mx-auto max-w-2xl text-white/70">
              Powerful AI-driven tools to accelerate your sales and revenue growth
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {/* LinkedIn Designer */}
            <Card className="group overflow-hidden border border-white/10 bg-black/40 transition-all duration-300 hover:border-purple-600/50">
              <CardHeader>
                <CardTitle className="font-heading text-xl">LinkedIn Designer</CardTitle>
                <CardDescription>AI-powered profile optimization</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex h-40 items-center justify-center rounded-md bg-gradient-to-br from-purple-600/20 to-blue-600/20">
                  {/* Simple icon */}
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 8C17.5913 8 19.1174 8.63214 20.2426 9.75736C21.3679 10.8826 22 12.4087 22 14V21H18V14C18 13.4696 17.7893 12.9609 17.4142 12.5858C17.0391 12.2107 16.5304 12 16 12C15.4696 12 14.9609 12.2107 14.5858 12.5858C14.2107 12.9609 14 13.4696 14 14V21H10V14C10 12.4087 10.6321 10.8826 11.7574 9.75736C12.8826 8.63214 14.4087 8 16 8Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M6 9H2V21H6V9Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 6C5.10457 6 6 5.10457 6 4C6 2.89543 5.10457 2 4 2C2.89543 2 2 2.89543 2 4C2 5.10457 2.89543 6 4 6Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-white/70">
                  Transform your LinkedIn profile with AI-powered optimization to attract more opportunities and stand out from the competition.
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="ghost" className="transition-colors group-hover:text-purple-600" asChild>
                  <Link href="/designer">
                    Learn more <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>

            {/* LinkedIn Accelerator */}
            <Card className="group overflow-hidden border border-white/10 bg-black/40 transition-all duration-300 hover:border-purple-600/50">
              <CardHeader>
                <CardTitle className="font-heading text-xl">LinkedIn Accelerator</CardTitle>
                <CardDescription>Automated outreach</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex h-40 items-center justify-center rounded-md bg-gradient-to-br from-blue-600/20 to-purple-600/20">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="white" strokeWidth="2" />
                    <path d="M15 16L12 13M12 13L9 10M12 13V8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-white/70">
                  Scale your LinkedIn outreach with intelligent automation that delivers personalized messages and builds meaningful connections.
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="ghost" className="transition-colors group-hover:text-purple-600" asChild>
                  <Link href="/dealflow">
                    Learn more <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>

            {/* Revolutionary ROS */}
            <Card className="group overflow-hidden border border-white/10 bg-black/40 transition-all duration-300 hover:border-purple-600/50">
              <CardHeader>
                <CardTitle className="font-heading text-xl">Revolutionary ROS</CardTitle>
                <CardDescription>Coming soon – for investors</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex h-40 items-center justify-center rounded-md bg-gradient-to-br from-gray-400/20 to-blue-600/20">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.742 9.96512 4.0113 9.77251C4.28059 9.5799 4.48572 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-white/70">
                  Our upcoming Revenue Operating System will revolutionize how sales teams work, providing real-time insights and automation.
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="ghost" className="transition-colors group-hover:text-purple-600" asChild>
                  <Link href="/investors">
                    Learn more <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-gradient-to-b from-black to-black/90 py-20">
        <div className="container mx-auto px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-heading md:text-4xl">Key Benefits</h2>
            <p className="mx-auto max-w-2xl text-white/70">
              Why leading sales teams choose VELLORA.AI for their revenue acceleration
            </p>
          </div>

          <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
            {/* Lightning Fast Performance */}
            <div className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-purple-600/20">
                <Zap className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="mb-3 text-xl font-semibold">Lightning-Fast Performance</h3>
              <p className="text-white/70">
                Our AI-powered platform delivers results in seconds, allowing your team to move at unprecedented speed.
              </p>
            </div>

            {/* Predictable Revenue Growth */}
            <div className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600/20">
                <LineChart className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="mb-3 text-xl font-semibold">Predictable Revenue Growth</h3>
              <p className="text-white/70">
                Transform your sales pipeline with data-driven insights that make revenue forecasting more accurate and reliable.
              </p>
            </div>

            {/* Superior Competitive Advantage */}
            <div className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gray-400/20">
                <Shield className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="mb-3 text-xl font-semibold">Superior Competitive Advantage</h3>
              <p className="text-white/70">
                Stay ahead of the competition with cutting-edge AI technology that continuously improves your sales process.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative overflow-hidden py-20">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/30 to-blue-600/30 opacity-30" />
        </div>

        <div className="container relative z-10 mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-6 text-3xl font-heading md:text-4xl">
              Ready to accelerate your revenue growth?
            </h2>
            <p className="mb-8 text-xl text-white/80">
              Join the leading sales teams already using VELLORA.AI to transform their revenue operations.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button size="lg" className="bg-white text-black hover:bg-white/90">
                Get Started
              </Button>
              <Button size="lg" variant="outline">
                Schedule a Demo
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default withI18n(Home);
