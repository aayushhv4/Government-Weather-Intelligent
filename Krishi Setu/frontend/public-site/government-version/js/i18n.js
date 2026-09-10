/* ============================================================
   KRISHI SETU — PUBLIC SITE LANGUAGE SYSTEM (i18n)
   ------------------------------------------------------------
   One language preference for the whole Krishi Setu product.

   This module reads and writes the SAME localStorage key the
   application dashboard uses (krishiSetuLang), so the public
   website and the dashboard stay synchronized:

     Public Home → Hindi  →  Open Platform → Dashboard opens Hindi
     Dashboard  → English  →  Public Home   → Public Home English

   No second translation architecture: this is the public side of
   the existing product language system. The dashboard's supported
   language codes (en hi mr gu pa bn ta te kn ml or) are all
   recognized and preserved; English is the base language (markup
   text) and Hindi has a full dictionary. Other languages display
   English content until their public dictionaries are added —
   the stored preference is never clobbered or mixed.

   Static markup is translated through data-i18n attributes;
   dynamic content (news, schemes, resources, steps, FAQs) swaps
   the shared KS data layer and re-renders via window.KS_RENDER.
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'krishiSetuLang'; /* same key as the application */

  var LANGS = [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिन्दी' },
    { code: 'mr', label: 'मराठी' },
    { code: 'gu', label: 'ગુજરાતી' },
    { code: 'pa', label: 'ਪੰਜਾਬੀ' },
    { code: 'bn', label: 'বাংলা' },
    { code: 'ta', label: 'தமிழ்' },
    { code: 'te', label: 'తెలుగు' },
    { code: 'kn', label: 'ಕನ್ನಡ' },
    { code: 'ml', label: 'മലയാളം' },
    { code: 'or', label: 'ଓଡ଼ିଆ' }
  ];

  /* ------------------------------------------------------------
     HINDI DICTIONARY — static text keys
     ------------------------------------------------------------ */
  var DICT = {
    hi: {
      /* chrome */
      skip: 'मुख्य सामग्री पर जाएँ',
      util_note: 'कृषि सेतु — सार्वजनिक सूचना पोर्टल',
      lang_aria: 'साइट की भाषा',
      nav_home: 'होम',
      nav_about: 'हमारे बारे में',
      nav_how: 'यह कैसे काम करता है',
      nav_schemes: 'योजनाएँ',
      nav_news: 'समाचार',
      nav_resources: 'संसाधन',
      nav_impact: 'प्रभाव',
      nav_support: 'सहायता',
      nav_contact: 'संपर्क',
      header_cta: 'प्लेटफ़ॉर्म खोलें ↗',
      cta_authed: 'डैशबोर्ड पर जाएँ →',
      menu_open: '☰ मेन्यू',
      menu_close: '✕ बंद करें',
      breadcrumb_aria: 'ब्रेडक्रंब',
      breadcrumb_home: 'होम',
      footer_about_text: 'कृषि सेतु एक प्रदर्शन कृषि मंच है जो किसानों, FPO और क्रेताओं को बाज़ार जानकारी, लॉजिस्टिक्स और भुगतान सुविधाओं से जोड़ता है।',
      footer_platform: 'प्लेटफ़ॉर्म',
      footer_info: 'जानकारी',
      footer_support: 'सहायता',
      footer_home: 'होम',
      footer_how: 'यह कैसे काम करता है',
      footer_impact: 'प्रभाव',
      footer_open_platform: 'प्लेटफ़ॉर्म खोलें',
      footer_about: 'हमारे बारे में',
      footer_schemes: 'सरकारी योजनाएँ',
      footer_news: 'समाचार और अपडेट',
      footer_resources: 'संसाधन',
      footer_farmer_support: 'किसान सहायता',
      footer_contact: 'संपर्क',
      footer_contact_text: 'demo@krishisetu.in<br>1800-XXX-XXXX (डेमो हेल्पलाइन)',
      footer_note: '© 2026 कृषि सेतु (अवधारणा प्रदर्शन)। यह वेबसाइट प्रदर्शन हेतु है; योजना विवरण केवल मार्गदर्शन है — आधिकारिक सरकारी पोर्टल पर हमेशा सत्यापित करें। डेमो आँकड़े तारांकित (*) हैं।',

      /* home */
      hero_tag: 'खेत से बाज़ार तक — एक जुड़ा हुआ प्लेटफ़ॉर्म',
      hero_title: 'कृषि सेतु किसानों को सीधे बाज़ार से जोड़ता है।',
      hero_lead: 'लाइव मंडी भाव, सीधे खेत-गेट क्रेता ऑफ़र, कोल्ड-चेन लॉजिस्टिक्स और पारदर्शी भुगतान — भारतीय किसानों, FPO और संस्थागत क्रेताओं के लिए।',
      hero_cta1: 'कृषि सेतु कैसे काम करता है',
      hero_cta2: 'प्लेटफ़ॉर्म खोलें ↗',
      hero_stat1: 'किसान जुड़े',
      hero_stat2: 'मंडी बाज़ार शामिल',
      hero_stat3: 'भारतीय भाषाएँ',
      hero_svg_aria: 'चित्रण: किसान से बाज़ार तक का संपर्क',
      hero_svg_caption: 'किसान → उपज → क्रेता → भुगतान',
      whatis_eyebrow: 'कृषि सेतु क्या है?',
      whatis_title: 'एक प्लेटफ़ॉर्म। खेत से बाज़ार तक की हर प्रक्रिया।',
      whatis_lead: 'कृषि सेतु किसानों के लिए बाज़ार सूचना, क्रेता खोज, लॉजिस्टिक्स और वित्तीय पारदर्शिता लाता है — और संस्थागत क्रेताओं के लिए सत्यापित आपूर्ति।',
      whatis_c1t: 'बाज़ार जानकारी',
      whatis_c1d: 'मंडी बेंचमार्क, रुझान और माँग संकेत — स्पष्ट रूप से प्रस्तुत, उपलब्ध होने पर आधिकारिक फ़ीड से अद्यतन।',
      whatis_c2t: 'सीधे क्रेता ऑफ़र',
      whatis_c2d: 'उपज लॉट प्रकाशित करें और सत्यापित संस्थागत क्रेताओं के ऑफ़र की तुलना मूल्य और शुद्ध प्राप्ति पर करें।',
      whatis_c3t: 'लॉजिस्टिक्स और भंडारण',
      whatis_c3d: 'परिवहन विकल्पों की तुलना करें, लागत का अनुमान लगाएँ और बेचने से पहले कोल्ड-चेन या गोदाम भंडारण की योजना बनाएँ।',
      whatis_c4t: 'वित्तीय पारदर्शिता',
      whatis_c4d: 'लाभ कैलकुलेटर, शुद्ध-प्राप्ति इंजन और एस्क्रो-समर्थित भुगतान पैसे के पक्ष को पारदर्शी बनाते हैं।',
      news_eyebrow: 'समाचार और अपडेट',
      news_title: 'कृषि सेतु से ताज़ा खबरें',
      news_lead: 'प्लेटफ़ॉर्म अपडेट, बाज़ार संक्षिप्त विवरण और किसान संसाधन। नीचे दी गई सभी कहानियाँ प्रदर्शन हेतु नमूना हैं।',
      news_viewall: 'सभी समाचार और अपडेट देखें →',
      steps_eyebrow: 'यह कैसे काम करता है',
      steps_title: 'इन्वेंट्री से भुगतान तक स्पष्ट राह',
      steps_lead: 'छह जुड़े कदम किसान को फ़सल रिकॉर्ड से एस्क्रो-समर्थित बिक्री तक ले जाते हैं।',
      steps_label: 'चरण',
      steps_cta: 'पूरा विवरण पढ़ें →',
      res_eyebrow: 'संसाधन',
      res_title: 'किसानों के लिए व्यावहारिक मार्गदर्शिकाएँ',
      res_lead: 'भंडारण, लॉजिस्टिक्स, वित्त, योजनाओं और बाज़ार रिपोर्ट पर सरल भाषा मार्गदर्शिकाएँ।',
      res_browse: 'पूरी संसाधन लाइब्रेरी देखें →',
      impact_eyebrow: 'प्रभाव',
      impact_title: 'प्लेटफ़ॉर्म क्या हासिल करना चाहता है',
      impact_lead: 'उत्पाद के इर्द-गिर्द बनाए गए परिणाम क्षेत्र। आँकड़े डेमो मान हैं।',
      impact_c1t: 'बेहतर मूल्य',
      impact_c1d: 'बेचने से पहले चैनलों की तुलना करें।',
      impact_c2t: 'तेज़ भुगतान',
      impact_c2d: 'डिलीवरी स्वीकृति पर एस्क्रो भुगतान जारी होता है।',
      impact_c3t: 'कम नुकसान',
      impact_c3d: 'शेल्फ-लाइफ और कोल्ड-चेन योजना।',
      impact_c4t: 'बाज़ार पहुँच',
      impact_c4d: 'गाँव की उपज संस्थागत माँग से जुड़ती है।',
      impact_more: 'पूरा प्रभाव अवलोकन देखें →',
      cta_title: 'इसे क्रियाशील देखने के लिए तैयार?',
      cta_lead: 'कृषि सेतु एप्लिकेशन खोलें और किसान व क्रेता वर्कस्पेस देखें।',
      cta_btn: 'प्लेटफ़ॉर्म खोलें ↗',

      /* how it works */
      how_crumb: 'कृषि सेतु कैसे काम करता है',
      how_title: 'कृषि सेतु कैसे काम करता है',
      how_lead: 'किसान की यात्रा एक जुड़ा हुआ प्रवाह है — फ़सल रिकॉर्ड से एस्क्रो-समर्थित भुगतान तक हर कदम अगले कदम को आगे बढ़ाता है।',
      how_conn_eyebrow: 'जुड़ा हुआ, बिखरा हुआ नहीं',
      how_conn_title: 'आपकी उपज का एक समान दृश्य',
      how_conn_lead: 'जब कोई किसान लॉट प्रकाशित करता है — जैसे प्याज़, 500 किग्रा, ग्रेड A — वही डेटा ऑफ़र, लाभ गणना, शुद्ध प्राप्ति, लॉजिस्टिक्स और अंतिम लेनदेन में लगातार प्रवाहित होता है।',
      how_c1t: '🧺 प्रकाशित करें',
      how_c1d: 'अपनी इन्वेंट्री से लॉट विवरण स्वतः भरें। मात्रा, ग्रेड, भंडारण और ताज़गी लॉट के साथ चलती है।',
      how_c2t: '🤝 ऑफ़र',
      how_c2d: 'क्रेता मूल्य, पिकअप और भुगतान शर्तों के साथ बोली लगाते हैं। केवल शीर्ष मूल्य से नहीं, शुद्ध प्राप्ति से ऑफ़र की तुलना करें।',
      how_c3t: '💳 भुगतान',
      how_c3d: 'ऑफ़र स्वीकारें, लॉजिस्टिक्स व्यवस्थित करें, डिलीवरी दें — और स्वीकृति पर एस्क्रो रेल से भुगतान पाएँ।',
      how_cta_title: 'यात्रा लाइव देखें',
      how_cta_lead: 'एप्लिकेशन खोलें और डेमो डेटा के साथ किसान प्रवाह देखें।',

      /* about */
      about_crumb: 'कृषि सेतु के बारे में',
      about_title: 'कृषि सेतु के बारे में',
      about_lead: 'कृषि सेतु एक प्रदर्शन कृषि मंच है जो एक विचार पर बना है: किसान को सीधे बाज़ार, क्रेता, लॉजिस्टिक्स और पैसे से जोड़ना — बिना किसी चरण में पारदर्शिता खोए।',
      about_mission_eyebrow: 'उद्देश्य',
      about_mission_title: 'खेती। संपर्क। समृद्धि।',
      about_mission_p1: 'अधिकांश किसान एक जैसी समस्याओं का सामना करते हैं: मूल्य पारदर्शी नहीं होते, क्रेता दूर होते हैं, लॉजिस्टिक्स महँगी होती है और भुगतान धीमा होता है। कृषि सेतु इन हर चरण को दृश्य और तुलनीय बनाने के लिए डिज़ाइन किया गया है — मंडी बेंचमार्क, सीधे क्रेता ऑफ़र, परिवहन विकल्प और हर कटौती के बाद की शुद्ध प्राप्ति।',
      about_mission_p2: 'यह प्लेटफ़ॉर्म एक प्रदर्शन उत्पाद है; इस साइट के सभी आँकड़े नमूना डेटा हैं जब तक कि किसी आधिकारिक पोर्टल से स्रोत न हों।',
      about_problem: 'समस्या',
      about_problem_l1: 'मंडियों और चैनलों में बिखरी मूल्य जानकारी।',
      about_problem_l2: 'लंबी बिचौलिया श्रृंखला जो किसान का हिस्सा घटाती है।',
      about_problem_l3: 'खराब भंडारण और लॉजिस्टिक्स योजना से फ़सल-पश्चात नुकसान।',
      about_problem_l4: 'बिक्री के बाद धीमा और अस्पष्ट भुगतान।',
      about_problem_l5: 'इन्वेंट्री, ऑफ़र और वित्त के प्रबंधन का कोई एक स्थान नहीं।',
      about_solution: 'समाधान',
      about_solution_l1: 'इन्वेंट्री, विश्लेषण, प्रकाशन और ऑफ़र के लिए एक वर्कस्पेस।',
      about_solution_l2: 'बिक्री चैनलों में शुद्ध-प्राप्ति तुलना।',
      about_solution_l3: 'नुकसान घटाने हेतु शेल्फ-लाइफ और कोल्ड-चेन मार्गदर्शन।',
      about_solution_l4: 'स्पष्ट स्थिति के साथ एस्क्रो-शैली भुगतान प्रवाह।',
      about_who_eyebrow: 'किसे जोड़ता है',
      about_who_title: 'किसान · क्रेता · लॉजिस्टिक्स · वित्त',
      about_who_c1t: 'किसान और FPO',
      about_who_c1d: 'इन्वेंट्री ट्रैक करें, लॉट प्रकाशित करें, ऑफ़र तुलना करें और बेचने से पहले वास्तविक लाभ देखें।',
      about_who_c2t: 'संस्थागत क्रेता',
      about_who_c2d: 'सत्यापित लॉट देखें, गुणवत्ता जाँचें, RFQ पोस्ट करें और गेट-QC प्रवाह के साथ ऑर्डर प्रबंधित करें।',
      about_who_c3t: 'लॉजिस्टिक्स भागीदार',
      about_who_c3d: 'ताज़ी उपज के लिए गति, क्षमता, लागत और खराब होने के जोखिम के आधार पर परिवहन विकल्प।',
      about_who_c4t: 'वित्त और भंडारण',
      about_who_c4d: 'बिक्री चक्र के इर्द-गिर्द गोदाम वित्तपोषण, एस्क्रो भुगतान और भुगतान सुविधाएँ।',
      about_tech_eyebrow: 'प्रौद्योगिकी और पारदर्शिता',
      about_tech_title: 'अपनी सीमाओं के प्रति खुला',
      about_tech_lead: 'कृषि सेतु उन एकीकरणों का दावा नहीं करता जो उसके पास नहीं हैं। इस साइट का हर डेमो मान, ऑफ़लाइन फ़ॉलबैक और बाहरी लिंक स्पष्ट रूप से चिह्नित है।',
      about_tech_c1t: '🔐 प्रमाणीकरण',
      about_tech_c1d: 'भूमिका-आधारित किसान, क्रेता और पर्यवेक्षक वर्कस्पेस, सुरक्षित रूट और डेमो लॉगिन के साथ।',
      about_tech_c2t: '🗄️ डेटा परत',
      about_tech_c2d: 'सुपाबेस-तैयार वास्तुकला, स्पष्ट रूप से अलग डेमो स्थिति के साथ ताकि बाद में वास्तविक सेवाएँ इसे बदल सकें।',
      about_tech_c3t: '🌐 बहुभाषी',
      about_tech_c3d: 'ग्यारह भारतीय भाषाएँ, लेआउट-परीक्षित अनुवाद और सिस्टम-प्राथमिकता-जागरूक थीम के साथ।',
      about_tech_cta: 'प्लेटफ़ॉर्म कैसे काम करता है देखें →',

      /* schemes */
      schemes_crumb: 'सरकारी योजनाएँ',
      schemes_title: 'किसानों के लिए सरकारी योजनाएँ',
      schemes_lead: 'सामान्य ज्ञात कृषि योजनाओं की संरचित निर्देशिका — आय सहायता, बीमा, ऋण, बाज़ार, सिंचाई और फ़सल-पश्चात। बाहरी लिंक आधिकारिक पोर्टल खोलते हैं।',
      schemes_note: 'मार्गदर्शन नोट: नीचे दिए गए योजना सारांश केवल सामान्य जानकारी हेतु हैं। आवेदन से पहले हमेशा आधिकारिक पोर्टल पर पात्रता, लाभ और समय-सीमा सत्यापित करें। कृषि सेतु सरकारी निकाय नहीं है।',
      filter_all: 'सभी श्रेणियाँ',
      filter_aria: 'श्रेणी द्वारा फ़िल्टर करें',
      schemes_search_ph: 'योजनाएँ खोजें…',
      schemes_search_aria: 'योजनाएँ खोजें',
      schemes_purpose: 'उद्देश्य:',
      schemes_eligible: 'पात्र:',
      schemes_benefits: 'मुख्य लाभ',
      schemes_docs: 'आवश्यक दस्तावेज़:',
      schemes_portal: 'आधिकारिक पोर्टल ↗',
      schemes_empty: 'आपके फ़िल्टर से मेल खाती कोई योजना नहीं।',

      /* news */
      news_page_crumb: 'समाचार और अपडेट',
      news_page_title: 'समाचार और अपडेट',
      news_page_lead: 'प्लेटफ़ॉर्म अपडेट, बाज़ार संक्षिप्त विवरण और किसान संसाधन। इस पृष्ठ की सभी कहानियाँ प्रदर्शन हेतु नमूना सामग्री हैं — ये वास्तविक समाचार रिपोर्ट नहीं हैं।',
      news_search_ph: 'कहानियाँ खोजें…',
      news_search_aria: 'कहानियाँ खोजें',
      news_notice: 'यहाँ की सभी कहानियाँ "नमूना" लेबल वाली हैं। ये उस प्रकार की सामग्री दर्शाती हैं जो वास्तविक संपादकीय सामग्री उपलब्ध होने पर सार्वजनिक साइट पर होगी।',
      news_read: 'मिनट पढ़ें',
      news_sample: 'नमूना कहानी',
      news_read_story: 'कहानी पढ़ें →',
      news_read_more: 'और पढ़ें →',
      news_empty: 'आपके फ़िल्टर से मेल खाती कोई कहानी नहीं।',

      /* resources */
      res_page_crumb: 'कृषि संसाधन',
      res_page_title: 'कृषि संसाधन',
      res_page_lead: 'किसानों के लिए सरल भाषा मार्गदर्शिकाओं की खोज योग्य लाइब्रेरी — फ़सल देखभाल, भंडारण, लॉजिस्टिक्स, वित्त, योजनाएँ और प्रशिक्षण।',
      res_search_ph: 'संसाधन खोजें…',
      res_search_aria: 'संसाधन खोजें',
      res_page_note: 'संसाधन प्रदर्शन प्रविष्टियाँ हैं। प्रत्येक विषय की विस्तृत मॉड्यूल कृषि सेतु एप्लिकेशन के भीतर हैं।',
      res_empty: 'आपके फ़िल्टर से मेल खाता कोई संसाधन नहीं।',

      /* impact */
      impact_page_crumb: 'प्रभाव',
      impact_page_title: 'प्रभाव',
      impact_page_lead: 'प्लेटफ़ॉर्म के परिणाम क्षेत्र। इस पृष्ठ के सभी आँकड़े प्रदर्शन मान हैं।',
      impact_hero_title: 'मापने योग्य परिणामों के लिए डिज़ाइन',
      impact_hero_lead: 'हर सुविधा किसान-सामने वाले परिणाम से जुड़ी है: बेहतर मूल्य, तेज़ भुगतान, कम नुकसान और व्यापक बाज़ार पहुँच।',
      impact_stat1: 'किसान जुड़े',
      impact_stat2: 'उपज श्रेणियाँ',
      impact_stat3: 'मंडी बाज़ार शामिल',
      impact_stat4: 'भारतीय भाषाएँ',
      impact_stat5: 'सत्यापित क्रेता',
      impact_stat6: 'डेमो भुगतान (₹)',
      impact_note: '* प्रदर्शन हेतु डेमो आँकड़े। सार्वजनिक लॉन्च से पहले सत्यापित प्लेटफ़ॉर्म आँकड़ों से बदलें।',
      impact_sec_eyebrow: 'परिणाम क्षेत्र',
      impact_sec_title: 'प्लेटफ़ॉर्म क्या हासिल करना चाहता है',
      impact_c1d_long: 'किसान बेचने से पहले मंडी बेंचमार्क, क्रेता बोलियों और चैनल शुद्ध-प्राप्ति की तुलना करते हैं।',
      impact_c2d_long: 'एस्क्रो-समर्थित भुगतान डिलीवरी स्वीकृति पर राशि जारी करता है।',
      impact_c3d_long: 'शेल्फ-लाइफ पूर्वानुमान और कोल्ड-चेन लॉजिस्टिक्स नाशवान खेप को प्राथमिकता देते हैं।',
      impact_c4d_long: 'एक बाज़ार गाँव-स्तरीय उपज को राज्यों भर की संस्थागत माँग से जोड़ता है।',
      impact_cta_title: 'प्लेटफ़ॉर्म देखें',
      impact_cta_lead: 'इन परिणामों के पीछे की सुविधाएँ प्रदर्शन एप्लिकेशन में देखें।',

      /* support */
      support_crumb: 'किसान सहायता',
      support_title: 'किसान सहायता',
      support_lead: 'भूमिकाओं, लॉट, ऑफ़र, भुगतान और डेटा के बारे में सामान्य प्रश्नों के उत्तर। एप्लिकेशन के भीतर समस्याओं के लिए कस्टमर केयर पेज का उपयोग करें।',
      support_faq_eyebrow: 'FAQ',
      support_faq_title: 'अक्सर पूछे जाने वाले प्रश्न',
      support_chan_eyebrow: 'चैनल',
      support_chan_title: 'सहायता कहाँ मिलेगी',
      support_c1t: '🎧 इन-ऐप कस्टमर केयर',
      support_c1d: 'भूमिका-विशिष्ट सहायता के लिए कृषि सेतु के भीतर कस्टमर केयर पेज खोलें।',
      support_c1cta: 'प्लेटफ़ॉर्म खोलें →',
      support_c2t: '📲 व्हाट्सऐप अलर्ट',
      support_c2d: 'एप्लिकेशन में ऑफ़र और ऑर्डर अपडेट के लिए व्हाट्सऐप अलर्ट टॉगल (डेमो) है।',
      support_c3t: '✉️ ईमेल',
      support_c3d: 'demo@krishisetu.in — डेमो मेलबॉक्स, वास्तविक सहायता हेतु निगरानी नहीं की जाती।',

      /* contact */
      contact_crumb: 'संपर्क',
      contact_title: 'कृषि सेतु से संपर्क करें',
      contact_lead: 'यह एक प्रदर्शन वेबसाइट है — नीचे दिया गया फ़ॉर्म वास्तविक संदेश नहीं भेजता। दिखाए गए संपर्क विवरण नमूना मान हैं।',
      contact_form_title: 'हमें संदेश भेजें (डेमो फ़ॉर्म)',
      form_name: 'आपका नाम',
      form_email: 'ईमेल पता',
      form_topic: 'विषय',
      form_topic1: 'सामान्य पूछताछ',
      form_topic2: 'किसान ऑनबोर्डिंग',
      form_topic3: 'क्रेता / खरीद',
      form_topic4: 'योजना जानकारी',
      form_topic5: 'वेबसाइट प्रतिक्रिया',
      form_msg: 'संदेश',
      form_send: 'संदेश भेजें',
      form_note: 'केवल डेमो — कोई संदेश कहीं प्रेषित नहीं होता।',
      form_success: '✅ धन्यवाद — यह प्रदर्शन फ़ॉर्म है, इसलिए कुछ नहीं भेजा गया।',
      contact_office_title: 'कार्यालय (डेमो)',
      contact_office_addr: 'कृषि सेतु (प्रदर्शन)<br>नासिक, महाराष्ट्र 422202<br>भारत',
      contact_office_contact: 'ईमेल: demo@krishisetu.in<br>हेल्पलाइन: 1800-XXX-XXXX (डेमो)',
      contact_map_title: 'स्थान (डेमो मानचित्र)',
      contact_map_aria: 'नमूना स्थान मानचित्र',
      contact_map_text: 'नासिक (डेमो स्थान)',

      /* article */
      article_loading: 'नमूना कहानी लोड हो रही है…',
      article_not_found: 'नमूना लेख नहीं मिला।',
      article_back_short: 'समाचार और अपडेट पर वापस',
      article_back: '← समाचार और अपडेट पर वापस',
      article_title_suffix: ' — कृषि सेतु (नमूना)',

      /* shared labels */
      cat_IncomeSupport: 'आय सहायता',
      cat_CropInsurance: 'फ़सल बीमा',
      cat_CreditFinance: 'ऋण और वित्त',
      cat_MarketTrade: 'बाज़ार और व्यापार',
      cat_CropAdvisory: 'फ़सल परामर्श',
      cat_WaterIrrigation: 'जल और सिंचाई',
      cat_PostHarvest: 'फ़सल-पश्चात',
      cat_Horticulture: 'बागवानी',
      cat_FoodCrops: 'खाद्य फ़सलें',
      cat_Platform: 'प्लेटफ़ॉर्म',
      cat_Market: 'बाज़ार',
      cat_Schemes: 'योजनाएँ',
      cat_Resources: 'संसाधन',
      cat_FarmerStories: 'किसान कहानियाँ',
      cat_FarmerGuides: 'किसान मार्गदर्शिकाएँ',
      cat_CropInformation: 'फ़सल जानकारी',
      cat_MarketResources: 'बाज़ार संसाधन',
      cat_GovernmentSchemes: 'सरकारी योजनाएँ',
      cat_Logistics: 'लॉजिस्टिक्स',
      cat_Finance: 'वित्त',
      cat_Training: 'प्रशिक्षण',
      type_Guide: 'मार्गदर्शिका',
      type_Checklist: 'चेकलिस्ट',
      type_Interactive: 'इंटरैक्टिव',
      type_FAQ: 'FAQ',
      ticker_aria: 'बाज़ार भाव (डेमो डेटा)',
      ticker_label: 'बाज़ार भाव',
      ticker_demo: 'डेमो डेटा',
      ticker_updated: 'अपडेट',
      ticker_today: 'आज',
      ticker_unavailable: 'बाज़ार भाव अस्थायी रूप से अनुपलब्ध',
      ticker_qtl: '/क्विंटल',
      ticker_up: 'ऊपर',
      ticker_down: 'नीचे',
      crop_Onion: 'प्याज़',
      crop_Tomato: 'टमाटर',
      crop_Potato: 'आलू',
      crop_Soybean: 'सोयाबीन',
      crop_Grapes: 'अंगूर',
      crop_Wheat: 'गेहूँ',
      crop_Rice: 'चावल',
      crop_Cotton: 'कपास',
      state_Maharashtra: 'महाराष्ट्र',
      state_MadhyaPradesh: 'मध्य प्रदेश',
      state_Haryana: 'हरियाणा',
      state_Gujarat: 'गुजरात'
    }
  };

  /* ------------------------------------------------------------
     HINDI DYNAMIC DATA — swapped into the shared KS layer
     ------------------------------------------------------------ */
  var DYN = {
    hi: {
      steps: [
        { n: '01', icon: '👤', title: 'अपनी प्रोफ़ाइल बनाएँ', text: 'किसान, FPO, क्रेता या पर्यवेक्षक के रूप में पंजीकरण करें। आपकी भूमिका आपके वर्कस्पेस को आकार देती है।' },
        { n: '02', icon: '📦', title: 'फ़सल इन्वेंट्री दर्ज करें', text: 'हर कटी हुई खेप के लिए फ़सल, किस्म, कटाई तिथि, भंडारण स्थिति और नमी दर्ज करें।' },
        { n: '03', icon: '🔬', title: 'उपज का विश्लेषण करें', text: 'AI ताज़गी स्कोर और शेल्फ-लाइफ पूर्वानुमान बताते हैं कि कौन सी खेप पहले बेचनी है।' },
        { n: '04', icon: '🧺', title: 'उपज लॉट प्रकाशित करें', text: 'इन्वेंट्री से लॉट विवरण स्वतः भरें और सत्यापित उपज को क्रेता बाज़ार में सूचीबद्ध करें।' },
        { n: '05', icon: '🤝', title: 'ऑफ़र प्राप्त करें और तुलना करें', text: 'मूल्य, कटौतियों के बाद शुद्ध प्राप्ति, पिकअप और भुगतान शर्तों पर क्रेता बोलियों की तुलना करें।' },
        { n: '06', icon: '💳', title: 'बेचें, भेजें और भुगतान पाएँ', text: 'अनुबंध लॉक करें, लॉजिस्टिक्स व्यवस्थित करें और डिलीवरी स्वीकृति पर एस्क्रो रेल से भुगतान करें।' }
      ],
      schemes: [
        { name: 'PM-KISAN — Pradhan Mantri Kisan Samman Nidhi', cat: 'Income Support', purpose: 'पात्र भूमिधारी किसान परिवारों को प्रति वर्ष ₹6,000 की प्रत्यक्ष आय सहायता (तीन किस्तों में)।', eligible: 'खेती योग्य भूमि वाले सभी भूमिधारी किसान परिवार, योजना की बहिष्करण शर्तों के अधीन।', benefits: ['प्रति वर्ष ₹6,000, 3 किस्तों में', 'आधार-लिंक्ड खाते में प्रत्यक्ष लाभ अंतरण', 'पूर्णतः ऑनलाइन आवेदन और स्थिति जाँच'], documents: 'आधार, भूमि रिकॉर्ड, बैंक खाता विवरण' },
        { name: 'PMFBY — Pradhan Mantri Fasal Bima Yojana', cat: 'Crop Insurance', purpose: 'अप्रत्याशित प्राकृतिक जोखिमों के विरुद्ध फ़सल बीमा, समान प्रीमियम 2% (खरीफ), 1.5% (रबी) और 5% (वाणिज्यिक/बागवानी फ़सलें)।', eligible: 'अधिसूचित क्षेत्रों में अधिसूचित फ़सलें उगाने वाले सभी किसान; ऋणी और गैर-ऋणी दोनों।', benefits: ['सब्सिडी वाला प्रीमियम', 'बुवाई रुकने, फ़सल-पश्चात हानि और स्थानीय आपदाओं का कवरेज', 'बैंक / CSC से ऑनलाइन नामांकन'], documents: 'भूमि रिकॉर्ड, बैंक खाता, फ़सल विवरण' },
        { name: 'Kisan Credit Card (KCC)', cat: 'Credit & Finance', purpose: 'खेती, फ़सल-पश्चात आवश्यकताओं और कृषि परिसंपत्तियों हेतु बैंकों से लचीला अल्पकालिक ऋण।', eligible: 'किसान, बटाईदार, काश्तकार किसान और कृषि गतिविधि योजना वाले FPO।', benefits: ['कम ब्याज वाले फ़सल ऋण', 'सीमा के भीतर आवश्यकतानुसार निकासी', 'कुछ राज्य योजनाओं में ब्याज अनुदान'], documents: 'पहचान प्रमाण, भूमि रिकॉर्ड, फ़सल योजना' },
        { name: 'eNAM — National Agriculture Market', cat: 'Market & Trade', purpose: 'कृषि वस्तुओं के लिए एकीकृत अखिल भारतीय ऑनलाइन व्यापार पोर्टल, जो APMC मंडियों को जोड़ता है।', eligible: 'eNAM पोर्टल पर पंजीकृत किसान, व्यापारी, FPO और कमीशन एजेंट।', benefits: ['पारदर्शी ऑनलाइन बोली', 'स्थानीय मंडी से परे क्रेताओं तक पहुँच', 'मानकीकृत गुणवत्ता मूल्यांकन'], documents: 'मंडी के माध्यम से eNAM पोर्टल पर पंजीकरण' },
        { name: 'Soil Health Card (SHC)', cat: 'Crop Advisory', purpose: 'हर खेत के लिए मिट्टी की पोषक स्थिति रिपोर्ट, उर्वरक अनुशंसाओं के साथ।', eligible: 'सभी किसान; सरकारी/मान्यता प्राप्त प्रयोगशालाओं में मिट्टी के नमूने जाँचे जाते हैं।', benefits: ['निःशुल्क मिट्टी जाँच', 'फ़सल-वार उर्वरक अनुशंसा', 'इनपुट लागत घटाने में सहायक'], documents: 'किसान पहचान, परीक्षण शिविर में भूमि विवरण' },
        { name: 'PMKSY — Per Drop More Crop (Micro-Irrigation)', cat: 'Water & Irrigation', purpose: 'ड्रिप/स्प्रिंकलर प्रणालियों से कुशल जल उपयोग, अनुदान सहायता के साथ।', eligible: 'व्यक्तिगत किसान और FPO; अनुदान राज्य और प्रणाली प्रकार के अनुसार भिन्न।', benefits: ['सूक्ष्म-सिंचाई प्रणालियों पर 55% तक अनुदान', 'उच्च जल-उपयोग दक्षता', 'बेहतर उपज स्थिरता'], documents: 'भूमि रिकॉर्ड, बैंक खाता, परियोजना योजना' },
        { name: 'Agriculture Infrastructure Fund (AIF)', cat: 'Post-Harvest', purpose: 'फ़सल-पश्चात बुनियादी ढाँचे — गोदाम, कोल्ड स्टोरेज, छँटाई/ग्रेडिंग इकाइयाँ — हेतु मध्यम/दीर्घकालिक ऋण।', eligible: 'किसान, FPO, कृषि-उद्यमी, स्टार्टअप और सहकारी समितियाँ।', benefits: ['ऋण पर ब्याज अनुदान', 'व्यक्तिगत परियोजनाओं हेतु ₹2 करोड़ तक ऋण', 'भंडारण और लॉजिस्टिक्स सुदृढ़ करता है'], documents: 'परियोजना रिपोर्ट, भूमि/भवन दस्तावेज़, बैंक प्रस्ताव' },
        { name: 'PM-AASHA — Price Support Scheme', cat: 'Market & Trade', purpose: 'मूल्य समर्थन योजना (PSS), मूल्य कमी भुगतान (PDP) और पायलट खरीद के माध्यम से लाभकारी मूल्य सुनिश्चित करता है।', eligible: 'न्यूनतम समर्थन मूल्य पर अधिसूचित तिलहन, दालें और कॉपरा उत्पादक किसान।', benefits: ['अधिसूचित फ़सलों हेतु MSP आश्वासन', 'एजेंसियों के माध्यम से खरीद', 'मूल्य गिरावट से सुरक्षा'], documents: 'भूमि रिकॉर्ड, खरीद केंद्र पर फ़सल विवरण' },
        { name: 'MIDH — Mission for Integrated Development of Horticulture', cat: 'Horticulture', purpose: 'बागवानी का समग्र विकास — रोपण सामग्री, संरक्षित खेती, फ़सल-पश्चात प्रबंधन।', eligible: 'बागवानी किसान और FPO; सहायता गतिविधि और राज्य के अनुसार भिन्न।', benefits: ['पॉलीहाउस / शेड नेट हेतु सहायता', 'फ़सल-पश्चात और कोल्ड-चेन समर्थन', 'उच्च मूल्य वाली बागवानी फ़सलें'], documents: 'परियोजना प्रस्ताव, भूमि रिकॉर्ड' },
        { name: 'NFSM — National Food Security Mission', cat: 'Food Crops', purpose: 'तकनीकी प्रदर्शनों और इनपुट के माध्यम से चावल, गेहूँ, दालें और मोटे अनाज का उत्पादन बढ़ाना।', eligible: 'लक्षित फ़सलें उगाने वाले अधिसूचित जिलों के किसान।', benefits: ['सब्सिडी वाले बीज और इनपुट', 'बेहतर कृषि पद्धतियों का प्रदर्शन', 'उत्पादकता में वृद्धि'], documents: 'राज्य कृषि विभाग द्वारा अधिसूचित अनुसार' }
      ],
      news: [
        {
          id: 'n1', featured: true, cat: 'Platform', date: '05 Sep 2026', read: '4 min',
          title: 'कृषि सेतु नासिक के प्याज़ उत्पादकों को खेत-गेट क्रेताओं से जोड़ता है',
          dek: 'एक नमूना कहानी: खेत-गेट लॉट, ताज़गी स्कोरिंग और एस्क्रो भुगतान एक प्लेटफ़ॉर्म पर कैसे एक साथ आते हैं।',
          body: [
            'यह प्रदर्शन वेबसाइट के लिए लिखा गया एक नमूना लेख है। यह वास्तविक समाचार रिपोर्ट नहीं है।',
            'इस परिदृश्य में, प्याज़ उत्पादक कटी हुई खेप इन्वेंट्री में दर्ज करते हैं, उपज लॉट प्रकाशित करते हैं, और संस्थागत क्रेताओं के ऑफ़र की तुलना करते हैं — जिसमें लॉजिस्टिक्स और शुल्क के बाद की शुद्ध प्राप्ति भी शामिल है।',
            'क्रेता ऑफ़र देने से पहले ताज़गी स्कोर, भंडारण स्थिति और सत्यापित विश्वास रेटिंग देखते हैं, और डिलीवरी स्वीकृत होने पर भुगतान एस्क्रो रेल से चलता है।',
            'यह कहानी उस उत्पाद प्रवाह को दर्शाती है जिसे कृषि सेतु एप्लिकेशन प्रदर्शित करता है।'
          ]
        },
        {
          id: 'n2', cat: 'Market', date: '28 Aug 2026', read: '3 min',
          title: 'मंडी मूल्य रुझान: इस महीने क्या देखें (नमूना)',
          dek: 'एक नमूना बाज़ार संक्षिप्त विवरण दिखाता है कि मॉडल मूल्य, आवक और रुझान संकेत प्लेटफ़ॉर्म पर कैसे प्रस्तुत होते हैं।',
          body: [
            'नमूना सामग्री — बाज़ार सलाह नहीं। कृषि सेतु उपलब्ध होने पर सरकारी मंडी अवलोकन दिखाता है, और अन्यथा योजना संदर्भों को स्पष्ट रूप से लेबल करता है।',
            'डेमो डैशबोर्ड प्याज़, टमाटर, आलू और सोयाबीन जैसी समर्थित फ़सलों के मॉडल मूल्य, 24-घंटे रुझान और आवक मात्रा ट्रैक करता है।'
          ]
        },
        {
          id: 'n3', cat: 'Resources', date: '21 Aug 2026', read: '5 min',
          title: 'कोल्ड स्टोरेज और शेल्फ लाइफ पर नए किसान-मार्गदर्शन मॉड्यूल (नमूना)',
          dek: 'नमूना अपडेट: संसाधन लाइब्रेरी में शेल्फ-लाइफ पूर्वानुमान और कोल्ड-चेन मार्गदर्शन मॉड्यूल जोड़े गए।',
          body: [
            'नमूना घोषणा। संसाधन लाइब्रेरी किसान मार्गदर्शिकाओं, फ़सल जानकारी, बाज़ार संसाधनों, योजनाओं, लॉजिस्टिक्स और वित्त में व्यवस्थित है।',
            'प्रत्येक मॉड्यूल सरल भाषा में लिखा गया है और एप्लिकेशन में कई भारतीय भाषाओं में उपलब्ध है।'
          ]
        },
        {
          id: 'n4', cat: 'Schemes', date: '14 Aug 2026', read: '3 min',
          title: 'PM-KISAN किस्त स्थिति: कैसे जाँचें (नमूना मार्गदर्शिका)',
          dek: 'एक नमूना मार्गदर्शिका बताती है कि किसान आधिकारिक पोर्टलों पर योजना किस्त स्थिति कैसे सत्यापित कर सकते हैं।',
          body: [
            'नमूना मार्गदर्शन। किसान आधिकारिक पोर्टल (pmkisan.gov.in) पर आधार-लिंक्ड विवरण से PM-KISAN किस्त स्थिति जाँच सकते हैं।',
            'कृषि सेतु की योजना निर्देशिका आधिकारिक पोर्टलों से जुड़ती है — कार्य करने से पहले वहाँ विवरण सत्यापित करें।'
          ]
        },
        {
          id: 'n5', cat: 'Farmer Stories', date: '07 Aug 2026', read: '4 min',
          title: 'FPO एकत्रीकरण पायलटों में लॉजिस्टिक्स बचत दिखी (नमूना)',
          dek: 'नमूना कहानी: कई किसानों के एकत्रित लॉट थोक क्रेताओं के लिए प्रति क्विंटल लॉजिस्टिक्स लागत घटाते हैं।',
          body: [
            'एकत्रीकरण सुविधा का नमूना चित्रण: आस-पास के सदस्य किसानों के अनुकूल लॉट संस्थागत मात्रा आवश्यकताओं को पूरा करने के लिए एकत्रित किए जाते हैं।',
            'मैच इंजन एकत्रित लॉट प्रस्तावित करने से पहले संयुक्त मात्रा, अनुमानित शुद्ध मूल्य और लॉजिस्टिक्स बचत का अनुमान लगाता है।'
          ]
        },
        {
          id: 'n6', cat: 'Platform', date: '30 Jul 2026', read: '2 min',
          title: 'प्लेटफ़ॉर्म पर अब ग्यारह भारतीय भाषाएँ समर्थित (नमूना)',
          dek: 'नमूना घोषणा: नेविगेशन, पृष्ठों और संसाधनों में अंग्रेज़ी के साथ दस भारतीय भाषाएँ।',
          body: [
            'नमूना घोषणा। एप्लिकेशन हिंदी, मराठी, गुजराती, पंजाबी, बंगाली, तमिल, तेलुगु, कन्नड़, मलयालम और उड़िया के अनुवाद शब्दकोश भेजता है।',
            'भाषा चयन सत्रों में बना रहता है, और लंबे अनुवादित स्ट्रिंग्स का मोबाइल चौड़ाई पर लेआउट परीक्षण किया जाता है।'
          ]
        }
      ],
      resources: [
        { icon: '📘', cat: 'Farmer Guides', type: 'Guide', title: 'कृषि सेतु से शुरुआत', desc: 'सरल भाषा वॉकथ्रू: प्रोफ़ाइल, इन्वेंट्री, प्रकाशन और आपकी पहली बिक्री।' },
        { icon: '🌾', cat: 'Crop Information', type: 'Guide', title: 'प्याज़ की फ़सल देखभाल और भंडारण की मूल बातें', desc: 'प्याज़ के लिए कटाई परिपक्वता, क्योरिंग, भंडारण स्थितियाँ और नमी नियंत्रण।' },
        { icon: '🍅', cat: 'Crop Information', type: 'Guide', title: 'टमाटर: गर्म मौसम में ताज़गी अवधि', desc: 'तापमान और आर्द्रता शेल्फ लाइफ कैसे घटाते हैं, और क्या करना चाहिए।' },
        { icon: '📊', cat: 'Market Resources', type: 'Guide', title: 'मंडी मूल्य रिपोर्ट पढ़ना', desc: 'मॉडल, न्यूनतम और अधिकतम मूल्य कैसे काम करते हैं, और 24-घंटे रुझान का अर्थ।' },
        { icon: '🏛️', cat: 'Government Schemes', type: 'Checklist', title: 'योजना आवेदन चेकलिस्ट', desc: 'आय सहायता, बीमा और ऋण योजनाओं के लिए आमतौर पर आवश्यक दस्तावेज़।' },
        { icon: '🚚', cat: 'Logistics', type: 'Guide', title: 'परिवहन विकल्प चुनना', desc: 'उपज के लिए वाहन प्रकारों में गति, क्षमता और खराब होने के जोखिम की तुलना।' },
        { icon: '💳', cat: 'Finance', type: 'Guide', title: 'शुद्ध प्राप्ति को समझना', desc: 'सकल मूल्य घटाकर परिवहन, शुल्क और फीस — जो वास्तव में आपको मिलता है।' },
        { icon: '🏦', cat: 'Finance', type: 'Guide', title: 'गोदाम वित्तपोषण की मूल बातें', desc: 'भंडारित उपज ऋण-मूल्य अनुपात पर कार्यशील-पूंजी वित्त कैसे समर्थन कर सकती है।' },
        { icon: '🎓', cat: 'Training', type: 'Interactive', title: 'इंटरैक्टिव प्लेटफ़ॉर्म ट्यूटोरियल', desc: 'कृषि सेतु एप्लिकेशन का निर्देशित, भूमिका-विशिष्ट वॉकथ्रू।' },
        { icon: '❓', cat: 'Training', type: 'FAQ', title: 'अक्सर पूछे जाने वाले प्रश्न', desc: 'भूमिकाओं, लॉट, ऑफ़र, भुगतान और सहायता के बारे में सामान्य प्रश्न।' },
        { icon: '🧊', cat: 'Logistics', type: 'Guide', title: 'कोल्ड चेन और रीफ़र की मूल बातें', desc: 'प्रशीतित परिवहन कब महत्वपूर्ण है, और इसकी लागत का अनुमान कैसे लगाएँ।' },
        { icon: '🤝', cat: 'Farmer Guides', type: 'Guide', title: 'FPO के साथ काम करना', desc: 'किसान उत्पादक संगठन उपज कैसे एकत्रित करते हैं और क्रेताओं से बातचीत करते हैं।' }
      ],
      faqs: [
        { q: 'क्या कृषि सेतु एक सरकारी वेबसाइट है?', a: 'नहीं। कृषि सेतु एक प्रदर्शन मंच है। यह संदर्भ हेतु आधिकारिक सरकारी योजना पोर्टलों से जुड़ता है, पर यह सरकारी निकाय नहीं है और किसी आधिकारिक समर्थन का दावा नहीं करता।' },
        { q: 'किसान और क्रेता वर्कस्पेस के बीच कैसे बदलूँ?', a: 'लॉगिन के बाद, शीर्ष पट्टी में भूमिका व्यक्तित्व स्विचर (किसान / क्रेता / पर्यवेक्षक) का उपयोग करें। आपकी भूमिका तय करती है कि कौन सा वर्कस्पेस और उपकरण दिखते हैं।' },
        { q: 'क्रेता ऑफ़र का भुगतान कैसे होता है?', a: 'प्रदर्शन प्रवाह में, स्वीकृत ऑफ़र एक ऑर्डर बनाता है और भुगतान डिलीवरी स्वीकृति पर एस्क्रो रेल से चलता है। लाइव भुगतान के लिए प्रोडक्शन बैकएंड आवश्यक है।' },
        { q: 'विश्वास और क्रेडिट अंक का क्या अर्थ है?', a: 'किसानों और क्रेताओं के बीच दो-तरफ़ा रेटिंग विश्वास स्कोर बनाती है। उच्च स्तर दृश्यता और शुल्क लाभ देते हैं — एप्लिकेशन में विश्वास और क्रेडिट पेज देखें।' },
        { q: 'क्या मंडी मूल्य वास्तविक हैं?', a: 'जब लाइव सरकारी फ़ीड कॉन्फ़िगर होता है, मूल्य आधिकारिक अवलोकनों से आते हैं। तब तक ऐप स्पष्ट रूप से लेबल किए गए ऑफ़लाइन/संदर्भ रो दिखाता है। इसे कभी आधिकारिक कोटेशन का विकल्प न मानें।' },
        { q: 'कोई समस्या कैसे रिपोर्ट करूँ?', a: 'एप्लिकेशन में कस्टमर केयर पेज, या इस वेबसाइट के संपर्क फ़ॉर्म का उपयोग करें। यह डेमो हेल्पलाइन वास्तविक सहायता लाइन नहीं है।' }
      ]
    }
  };

  /* ------------------------------------------------------------
     PAGE TITLES (Hindi) — keyed by html filename
     ------------------------------------------------------------ */
  var TITLES = {
    hi: {
      index: 'कृषि सेतु — खेती। संपर्क। समृद्धि। | सार्वजनिक सूचना पोर्टल',
      about: 'कृषि सेतु के बारे में — कृषि सेतु सार्वजनिक पोर्टल',
      'how-it-works': 'कृषि सेतु कैसे काम करता है — कृषि सेतु सार्वजनिक पोर्टल',
      schemes: 'सरकारी योजनाएँ — कृषि सेतु सार्वजनिक पोर्टल',
      news: 'समाचार और अपडेट — कृषि सेतु सार्वजनिक पोर्टल',
      resources: 'कृषि संसाधन — कृषि सेतु सार्वजनिक पोर्टल',
      impact: 'प्रभाव — कृषि सेतु सार्वजनिक पोर्टल',
      support: 'किसान सहायता — कृषि सेतु सार्वजनिक पोर्टल',
      contact: 'संपर्क — कृषि सेतु सार्वजनिक पोर्टल'
    }
  };

  /* ------------------------------------------------------------
     ENGINE
     ------------------------------------------------------------ */
  function normalize(code) {
    for (var i = 0; i < LANGS.length; i++) {
      if (LANGS[i].code === code) return code;
    }
    return 'en';
  }

  var currentLang = 'en';
  try {
    currentLang = normalize(localStorage.getItem(STORAGE_KEY) || 'en');
  } catch (e) {}

  var pageKey = ((location.pathname.split('/').pop() || 'index.html')).replace('.html', '');
  var ORIG = null;           /* snapshot of English KS data */
  var ORIG_TITLE = document.title;

  function snapshot() {
    if (ORIG || !window.KS) return;
    ORIG = {
      steps: KS.steps, schemes: KS.schemes, news: KS.news,
      resources: KS.resources, faqs: KS.faqs
    };
  }

  function swapData() {
    var d = DYN[currentLang];
    if (!d || !window.KS) return;
    snapshot();
    KS.steps = d.steps;
    KS.schemes = d.schemes;
    KS.news = d.news;
    KS.resources = d.resources;
    KS.faqs = d.faqs;
  }

  function restoreData() {
    if (!ORIG || !window.KS) return;
    KS.steps = ORIG.steps;
    KS.schemes = ORIG.schemes;
    KS.news = ORIG.news;
    KS.resources = ORIG.resources;
    KS.faqs = ORIG.faqs;
  }

  function rerender() {
    var R = window.KS_RENDER;
    if (!R) return;
    if (R.news) R.news();
    if (R.article) R.article();
    if (R.schemes) R.schemes();
    if (R.resources) R.resources();
    if (R.steps) R.steps();
    if (R.homeResources) R.homeResources();
    if (R.faqs) R.faqs();
    if (R.ticker) R.ticker();
  }

  /* Snapshot of the original (English) static text/aria/placeholder values,
     taken before the first translation is applied. Used to restore the
     markup defaults when switching back to English (or any language that
     has no dictionary entry for a key). */
  var ORIG_STATIC = [];
  (function () {
    var els = document.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-aria],[data-i18n-ph],[data-i18n-opt]');
    for (var i = 0; i < els.length; i++) {
      ORIG_STATIC.push({
        el: els[i],
        text: els[i].textContent,
        html: els[i].innerHTML,
        aria: els[i].getAttribute('aria-label'),
        ph: els[i].getAttribute('placeholder')
      });
    }
  })();

  function applyStatic() {
    var d = DICT[currentLang] || {};
    document.documentElement.lang = currentLang;

    /* Restore markup defaults first, then apply the current language.
       NOTE: only text-keyed elements (data-i18n / data-i18n-opt) get their
       textContent restored — aria/placeholder-only elements such as the
       <select> must never be text-replaced or their <option> children
       would be destroyed. */
    ORIG_STATIC.forEach(function (o) {
      if (o.el.hasAttribute('data-i18n-html')) o.el.innerHTML = o.html;
      else if (o.el.hasAttribute('data-i18n') || o.el.hasAttribute('data-i18n-opt')) o.el.textContent = o.text;
      if (o.el.hasAttribute('data-i18n-aria') && o.aria !== null) o.el.setAttribute('aria-label', o.aria);
      if (o.el.hasAttribute('data-i18n-ph') && o.ph !== null) o.el.setAttribute('placeholder', o.ph);
    });

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (el.dataset.authState === 'in' && el.hasAttribute('data-i18n-authed')) {
        key = el.getAttribute('data-i18n-authed');
      }
      var txt = d[key];
      if (txt) el.textContent = txt;
    });

    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var txt = d[el.getAttribute('data-i18n-html')];
      if (txt) el.innerHTML = txt;
    });

    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var txt = d[el.getAttribute('data-i18n-aria')];
      if (txt) el.setAttribute('aria-label', txt);
    });

    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var txt = d[el.getAttribute('data-i18n-ph')];
      if (txt) el.setAttribute('placeholder', txt);
    });

    document.querySelectorAll('[data-i18n-opt]').forEach(function (el) {
      var txt = d[el.getAttribute('data-i18n-opt')];
      if (txt) el.textContent = txt;
    });

    var sel = document.getElementById('langSelect');
    if (sel) sel.value = currentLang;
  }

  function applyTitle() {
    if (pageKey === 'news-article') return; /* renderArticle sets it */
    var titles = TITLES[currentLang];
    if (titles && titles[pageKey]) document.title = titles[pageKey];
    else document.title = ORIG_TITLE;
  }

  function apply() {
    applyStatic();
    if (currentLang === 'en') restoreData();
    else swapData();
    rerender();
    applyTitle();
  }

  function setLang(code) {
    code = normalize(code);
    if (code === currentLang) { apply(); return; }
    currentLang = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) {}
    apply();
  }

  function t(key, fallback) {
    var d = DICT[currentLang];
    if (d && d[key]) return d[key];
    return fallback;
  }

  /* switcher + cross-tab sync */
  function wire() {
    var sel = document.getElementById('langSelect');
    if (sel) {
      sel.addEventListener('change', function () { setLang(sel.value); });
    }
    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY) {
        var next = normalize(e.newValue || 'en');
        if (next !== currentLang) {
          currentLang = next;
          apply();
        }
      }
    });
  }

  /* Expose the API BEFORE the first apply(): the renderers read it through
     tr() during the initial re-render, so it must already exist. */
  window.KS_I18N = {
    lang: function () { return currentLang; },
    setLang: setLang,
    t: t,
    LANGS: LANGS
  };

  wire();
  apply();
})();