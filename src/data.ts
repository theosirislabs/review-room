import { Post } from "./types";

export const mockPosts: Post[] = [
  {
    id: "p1",
    title: "Spring Collection Launch",
    format: "carousel",
    mediaUrls: [
      "https://picsum.photos/seed/spring1/800/1000",
      "https://picsum.photos/seed/spring2/800/1000",
      "https://picsum.photos/seed/spring3/800/1000",
    ],
    caption:
      "The new season is finally here. Discover our Spring Collection, featuring lightweight fabrics and vibrant tones designed for the modern explorer.\n\nShop the link in bio.",
    hashtags: ["#SpringCollection", "#ModernExplorer", "#NewArrivals"],
    date: "2026-03-01",
    time: "09:00 AM",

    clientStatus: "Needs Your Review",
    clientComments: [],

    internalStatus: "Ready for Client",
    assignee: "Sarah J.",
    campaignCode: "SPR26-LCH",
    contentPillar: "Product Launch",
    internalNotes:
      "Ensure colors match the final lookbook PDF. Client was very specific about the green tones.",
    assetLineage: "Final color grade from v3 folder. Do not use v2.",
    isBlocked: false,
    internalTasks: [
      {
        id: "t1",
        text: "Verify color grade with creative director",
        completed: true,
      },
    ],
  },
  {
    id: "p2",
    title: "Behind the Scenes Reel",
    format: "reel",
    mediaUrls: ["https://picsum.photos/seed/btsreel/800/1000"],
    caption:
      "A little peek behind the curtain of our latest shoot. It takes a village. 🎬✨",
    hashtags: ["#BehindTheScenes", "#CreativeProcess", "#OnSet"],
    date: "2026-03-03",
    time: "12:00 PM",

    clientStatus: "Approved",
    clientComments: [
      {
        id: "c1",
        author: "Client",
        text: "Love this energy! Approved.",
        timestamp: "2026-02-20T10:00:00Z",
        isInternalOnly: false,
      },
    ],

    internalStatus: "Scheduled",
    assignee: "Mike T.",
    campaignCode: "SPR26-BTS",
    contentPillar: "Culture",
    internalNotes: "Audio is licensed via Artlist. Do not change the track.",
    assetLineage: "Final cut from editor (v4_final_final.mp4)",
    isBlocked: false,
    internalTasks: [],
  },
  {
    id: "p3",
    title: "Founder Quote",
    format: "image",
    mediaUrls: ["https://picsum.photos/seed/quote/800/1000"],
    caption:
      '"Design is not just what it looks like and feels like. Design is how it works." - A reminder of our core philosophy as we build the next generation of tools.',
    hashtags: ["#DesignThinking", "#FounderQuote", "#Philosophy"],
    date: "2026-03-05",
    time: "10:00 AM",

    clientStatus: "Changes Requested",
    clientComments: [
      {
        id: "c2",
        author: "Client",
        text: "Can we change the background color to our secondary brand blue? The contrast feels a bit harsh.",
        timestamp: "2026-02-21T14:30:00Z",
        isInternalOnly: false,
      },
    ],

    internalStatus: "Changes Requested",
    assignee: "Elena R.",
    campaignCode: "ALW-ON",
    contentPillar: "Thought Leadership",
    internalNotes:
      "Designer needs to update the background hex to #1A3B5C. Need this done by EOD.",
    assetLineage: "Figma file: Quotes_Q1.fig",
    isBlocked: false,
    internalTasks: [
      { id: "t2", text: "Update background color", completed: false },
      { id: "t3", text: "Re-export and upload", completed: false },
    ],
  },
  {
    id: "p4",
    title: "Product Feature Highlight",
    format: "image",
    mediaUrls: ["https://picsum.photos/seed/feature/800/1000"],
    caption:
      "Engineered for durability. The new reinforced stitching means your gear lasts longer, no matter where you take it.",
    hashtags: ["#ProductDesign", "#Durability", "#Quality"],
    date: "2026-03-08",
    time: "03:00 PM",

    clientStatus: "Needs Your Review",
    clientComments: [],

    internalStatus: "Ready for Client",
    assignee: "Sarah J.",
    campaignCode: "SPR26-EDU",
    contentPillar: "Education",
    internalNotes:
      "Double check the technical specs with the product team before final approval.",
    assetLineage: "Studio shot 4B, retouched.",
    isBlocked: false,
    internalTasks: [],
  },
  {
    id: "p5",
    title: "Community Spotlight",
    format: "carousel",
    mediaUrls: [
      "https://picsum.photos/seed/comm1/800/1000",
      "https://picsum.photos/seed/comm2/800/1000",
    ],
    caption:
      "Seeing how you style our pieces is our favorite part of the day. Tag us to be featured in our next community roundup! 📸",
    hashtags: ["#Community", "#StyleInspo", "#OOTD"],
    date: "2026-03-10",
    time: "11:00 AM",

    clientStatus: "Needs Your Review",
    clientComments: [],

    internalStatus: "Internal QA",
    assignee: "Mike T.",
    campaignCode: "ALW-ON",
    contentPillar: "UGC",
    internalNotes: "Waiting on usage rights confirmation for the second photo.",
    assetLineage: "UGC folder -> March",
    isBlocked: true,
    blockedReason: "Missing usage rights for slide 2",
    internalTasks: [
      {
        id: "t4",
        text: "DM user @styleicon for photo rights",
        completed: false,
      },
    ],
  },
  {
    id: "p6",
    title: "Weekend Sale Teaser",
    format: "reel",
    mediaUrls: ["https://picsum.photos/seed/sale/800/1000"],
    caption:
      "Something big is coming this weekend. Turn on post notifications so you don't miss out. 🤫",
    hashtags: ["#WeekendSale", "#Teaser", "#ComingSoon"],
    date: "2026-03-12",
    time: "06:00 PM",

    clientStatus: "Approved",
    clientComments: [],

    internalStatus: "Approved",
    assignee: "Elena R.",
    campaignCode: "PROMO-MAR",
    contentPillar: "Promotional",
    internalNotes:
      'Hook line: "Wait for it..." - ensure text overlay is within safe zones.',
    assetLineage: "Motion graphics team -> Final render",
    isBlocked: false,
    internalTasks: [],
  },
];
