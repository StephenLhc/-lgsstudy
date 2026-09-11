import { Footer, Navbar } from '../components';
import { About, Explore, Feedback, GetStarted, Hero, Insights, World } from '../sections';

const Page = () => (
  <div>
    <Navbar />
    <Hero />
    <About />
    <Explore />
    <GetStarted />
    <World />
    <Insights />
    <Feedback />
    <Footer />
  </div>
);

export default Page;
