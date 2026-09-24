import React from"react";
import Link from"next/link";
import { Plus, Megaphone } from"lucide-react";

const Banner = () => {
 return (
 <div className="relative w-full h-40 shrink-0 bg-gradient-to-r from-blue-700 via-blue-600 to-blue-400 overflow-hidden mb-4 flex items-center px-5 md:px-10">
 {/* Decorative Background Elements */}
 <div className="absolute inset-0 opacity-10">
 <div className="absolute top-0 right-1/4 w-64 h-64 bg-white mix-blend-overlay filter blur-3xl translate-y-[-50%]"></div>
 <div className="absolute bottom-0 right-10 w-96 h-96 bg-blue-300 mix-blend-overlay filter blur-3xl translate-y-[50%]"></div>
 </div>

 {/* Content */}
 <div className="relative z-10 max-w-[200px] md:max-w-lg ml-2 md:ml-6">
 <h2 className="text-lg md:text-xl font-bold text-white mb-1 leading-tight">
 Good Morning,
 <br />
 Rahul Sharma 👋
 </h2>
 <p className="text-blue-100 mb-3 text-[10px] md:text-xs">
 Together for a cleaner, safer and better community.
 </p>
 <Link
 href="/dashboard/register"
 className="bg-white text-blue-700 hover:bg-blue-50 transition-colors font-semibold py-2 px-4 md:py-2.5 md:px-5 flex items-center gap-2 text-sm md:text-base rounded-md shadow-md w-max"
 >
 <Plus className="w-4 h-4 md:w-5 md:h-5" />
 Register Complaint
 </Link>
 </div>

 {/* Graphic elements to emulate the city and megaphone */}
 <div className="absolute right-0 bottom-0 h-full w-1/2 overflow-hidden md:overflow-visible pointer-events-none flex items-end justify-end">
 {/* Abstract Buildings */}
 <div className="absolute bottom-0 right-20 flex items-end gap-1 opacity-40">
 <div className="w-8 h-24 bg-blue-900/50"></div>
 <div className="w-12 h-32 bg-blue-800/50"></div>
 <div className="w-10 h-40 bg-blue-900/60"></div>
 <div className="w-8 h-20 bg-blue-800/40"></div>
 <div className="w-14 h-28 bg-blue-900/50"></div>
 <div className="w-10 h-16 bg-blue-800/50"></div>
 </div>

 {/* Megaphone Graphic */}
 <div className="absolute right-4 md:right-24 top-1/2 -translate-y-1/2 text-white/90 drop-shadow-xl transform -rotate-12">
 <Megaphone
 size={90}
 strokeWidth={1}
 fill="currentColor"
 className="text-white/20"
 />
 <div className="absolute top-0 right-full mr-4 flex flex-col gap-2 -mt-4">
 <div className="w-6 h-1 bg-white/40 rotate-45 transform origin-right"></div>
 <div className="w-8 h-1 bg-white/60"></div>
 <div className="w-6 h-1 bg-white/40 -rotate-45 transform origin-right"></div>
 </div>
 </div>
 </div>
 </div>
 );
};

export default Banner;
