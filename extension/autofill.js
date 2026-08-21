(async () => {
  const { autofillProfile: profile = {} } = await chrome.storage.local.get('autofillProfile');

  const rules = [
    ['fullName', ['姓名', '中文名', '真实姓名', 'name', 'full name', 'fullname', 'candidate name']],
    ['englishName', ['英文名', '英文姓名', 'english name', 'preferred name']],
    ['phone', ['手机号', '手机号码', '联系电话', '联系方式', '电话', 'mobile', 'phone', 'telephone', 'tel']],
    ['email', ['邮箱', '电子邮箱', '邮件', 'email', 'e-mail', 'mail address']],
    ['gender', ['性别', 'gender', 'sex']],
    ['birthDate', ['出生日期', '出生年月', '生日', 'date of birth', 'birth date', 'birthday', 'dob']],
    ['city', ['当前城市', '所在城市', '现居城市', '居住城市', 'current city', 'location', 'city']],
    ['hometown', ['籍贯', '生源地', '户籍所在地', 'hometown', 'native place']],
    ['address', ['详细地址', '现居地址', '联系地址', '通讯地址', 'address', 'street address']],
    ['school', ['毕业院校', '学校名称', '就读学校', '学校', 'university', 'college name', 'school']],
    ['college', ['学院名称', '院系名称', '所在院系', '学院', '院系', 'department', 'faculty']],
    ['degree', ['最高学历', '学历层次', '学历', 'education level', 'education background']],
    ['degreeName', ['学位名称', '所获学位', '学位', 'degree name', 'academic degree']],
    ['major', ['专业名称', '所学专业', '专业', 'field of study', 'major', 'discipline']],
    ['educationStartDate', ['入学时间', '入学日期', '开始时间', 'education start date', 'enrollment date']],
    ['graduationDate', ['毕业时间', '毕业日期', '预计毕业', 'graduation date', 'graduate date', 'graduation year']],
    ['educationCountry', ['学校所在国家', '教育国家', '留学国家', 'country of study']],
    ['educationCity', ['学校所在城市', '院校城市', '教育城市', 'school city']],
    ['studyMode', ['就读形式', '学习形式', '培养方式', '全日制', 'study mode']],
    ['gpa', ['平均绩点', '绩点', '平均成绩', 'gpa', 'grade point average']],
    ['ranking', ['专业排名', '成绩排名', '班级排名', 'rank', 'ranking']],
    ['employmentStatus', ['求职状态', '当前状态', '在职状态', 'employment status', 'job status']],
    ['desiredRole', ['期望职位', '意向职位', '应聘岗位', '申请职位', 'desired role', 'position applied', 'job title']],
    ['desiredCity', ['期望城市', '意向城市', '工作地点', 'preferred city', 'desired location']],
    ['availableDate', ['到岗时间', '入职时间', '最早到岗', 'available date', 'start date']],
    ['wechat', ['微信号', '微信', 'wechat', 'weixin']],
    ['linkedin', ['领英', 'linkedin']],
    ['github', ['github', '代码仓库']],
    ['portfolio', ['作品集', '个人网站', '个人主页', 'portfolio', 'website', 'homepage', 'personal site']]
  ];

  const educationFieldMap = {
    school: 'school',
    college: 'college',
    degree: 'degree',
    degreeName: 'degreeName',
    major: 'major',
    educationStartDate: 'startDate',
    graduationDate: 'endDate',
    educationCountry: 'country',
    educationCity: 'city',
    studyMode: 'studyMode',
    gpa: 'gpa',
    ranking: 'ranking'
  };

  const educations = Array.isArray(profile.educations) ? profile.educations : [];

  const normalize = (text) => String(text || '').toLowerCase().replace(/[\s_\-:：*（）()【】\[\].]/g, '');

  function associatedText(element) {
    const chunks = [
      element.name,
      element.id,
      element.placeholder,
      element.getAttribute('aria-label'),
      element.getAttribute('data-field'),
      element.getAttribute('autocomplete')
    ];
    if (element.labels) chunks.push(...Array.from(element.labels, (label) => label.innerText));
    const nearby = element.closest('label, .form-item, .form-group, .field, [class*="formItem"], [class*="field"]');
    if (nearby) chunks.push(nearby.innerText.slice(0, 160));
    const previous = element.previousElementSibling;
    if (previous) chunks.push(previous.innerText || previous.textContent);
    return normalize(chunks.filter(Boolean).join(' '));
  }

  function fieldKey(element) {
    const text = associatedText(element);
    if (!text) return null;
    let best = null;
    let bestLength = 0;
    for (const [key, aliases] of rules) {
      if (!hasValue(key)) continue;
      for (const alias of aliases) {
        const candidate = normalize(alias);
        if (candidate.length > bestLength && text.includes(candidate)) {
          best = key;
          bestLength = candidate.length;
        }
      }
    }
    return best;
  }

  function hasValue(key) {
    if (educationFieldMap[key]) {
      return educations.some((education) => String(education?.[educationFieldMap[key]] || '').trim())
        || Boolean(String(profile[key] || '').trim());
    }
    return Boolean(String(profile[key] || '').trim());
  }

  function valueFor(key, occurrence) {
    const educationProperty = educationFieldMap[key];
    if (!educationProperty) return String(profile[key] || '').trim();
    const educationValue = educations[occurrence]?.[educationProperty];
    if (String(educationValue || '').trim()) return String(educationValue).trim();
    if (occurrence === 0) return String(profile[key] || '').trim();
    return '';
  }

  function emitEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    emitEvents(element);
  }

  function chooseSelect(select, value) {
    const target = normalize(value);
    const options = Array.from(select.options);
    const option = options.find((item) => normalize(item.value) === target || normalize(item.textContent) === target)
      || options.find((item) => normalize(item.textContent).includes(target) || target.includes(normalize(item.textContent)));
    if (!option) return false;
    select.value = option.value;
    emitEvents(select);
    return true;
  }

  function isUsable(element) {
    if (element.disabled || element.readOnly) return false;
    if (element.closest('[hidden], [aria-hidden="true"]')) return false;
    if (element instanceof HTMLInputElement && ['hidden', 'password', 'file', 'submit', 'button', 'reset', 'image'].includes(element.type)) return false;
    return true;
  }

  let filled = 0;
  let skipped = 0;
  const educationOccurrences = {};
  const elements = Array.from(document.querySelectorAll('input, textarea, select'));

  for (const element of elements) {
    if (!isUsable(element)) continue;
    const key = fieldKey(element);
    if (!key) continue;
    const occurrence = educationFieldMap[key] ? (educationOccurrences[key] || 0) : 0;
    if (educationFieldMap[key]) educationOccurrences[key] = occurrence + 1;
    const value = valueFor(key, occurrence);
    if (!value) continue;

    if (element instanceof HTMLInputElement && ['radio', 'checkbox'].includes(element.type)) {
      const choiceText = normalize(`${element.value} ${element.labels ? Array.from(element.labels, (label) => label.innerText).join(' ') : ''}`);
      if (choiceText.includes(normalize(value))) {
        element.click();
        filled += 1;
      }
      continue;
    }

    if (String(element.value || '').trim()) {
      skipped += 1;
      continue;
    }

    if (element instanceof HTMLSelectElement) {
      if (chooseSelect(element, value)) filled += 1;
    } else {
      setNativeValue(element, value);
      element.dataset.offerflowFilled = 'true';
      element.style.boxShadow = '0 0 0 2px rgba(99, 91, 255, .32)';
      filled += 1;
    }
  }

  return { filled, skipped };
})();
