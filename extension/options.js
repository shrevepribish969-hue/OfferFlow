const form = document.getElementById('profileForm');
const saveStatus = document.getElementById('saveStatus');
const educationList = document.getElementById('educationList');
const addEducationBtn = document.getElementById('addEducationBtn');

const blankEducation = () => ({
  school: '',
  college: '',
  degree: '',
  degreeName: '',
  major: '',
  startDate: '',
  endDate: '',
  country: '',
  city: '',
  studyMode: '',
  gpa: '',
  ranking: ''
});

function updateEducationNumbers() {
  const cards = Array.from(educationList.querySelectorAll('.education-card'));
  cards.forEach((card, index) => {
    card.querySelector('h3').textContent = `第 ${index + 1} 段教育经历`;
    card.querySelector('.education-order').textContent = index === 0 ? '最高或最近学历' : '更早的学历';
    card.querySelector('.remove-education').hidden = cards.length === 1;
  });
}

function addEducation(education = blankEducation()) {
  const card = document.createElement('article');
  card.className = 'education-card';
  card.innerHTML = `
    <div class="education-card-header">
      <div><h3></h3><p class="education-order"></p></div>
      <button class="remove-education" type="button">删除本段</button>
    </div>
    <div class="form-grid">
      <label><span>学校</span><input data-education-field="school" placeholder="例如：复旦大学"></label>
      <label><span>学院 / 院系</span><input data-education-field="college" placeholder="例如：管理学院"></label>
      <label><span>学历</span><select data-education-field="degree"><option value="">请选择</option><option>博士</option><option>硕士</option><option>本科</option><option>大专</option><option>高中</option></select></label>
      <label><span>学位</span><input data-education-field="degreeName" placeholder="例如：管理学硕士"></label>
      <label><span>专业</span><input data-education-field="major" placeholder="例如：计算机科学与技术"></label>
      <label><span>就读形式</span><select data-education-field="studyMode"><option value="">请选择</option><option>全日制</option><option>非全日制</option><option>海外留学</option></select></label>
      <label><span>入学时间</span><input data-education-field="startDate" type="month"></label>
      <label><span>毕业时间</span><input data-education-field="endDate" type="month"></label>
      <label><span>国家 / 地区</span><input data-education-field="country" placeholder="例如：中国大陆"></label>
      <label><span>学校所在城市</span><input data-education-field="city" placeholder="例如：上海"></label>
      <label><span>GPA / 成绩</span><input data-education-field="gpa" placeholder="例如：3.7 / 4.0"></label>
      <label><span>专业排名</span><input data-education-field="ranking" placeholder="例如：前 10%"></label>
    </div>`;

  for (const input of card.querySelectorAll('[data-education-field]')) {
    input.value = education[input.dataset.educationField] ?? '';
  }
  card.querySelector('.remove-education').addEventListener('click', () => {
    card.remove();
    updateEducationNumbers();
  });
  educationList.appendChild(card);
  updateEducationNumbers();
}

function collectEducations() {
  return Array.from(educationList.querySelectorAll('.education-card')).map((card) => {
    const education = {};
    for (const input of card.querySelectorAll('[data-education-field]')) {
      education[input.dataset.educationField] = input.value.trim();
    }
    return education;
  });
}

async function loadProfile() {
  const { autofillProfile = {} } = await chrome.storage.local.get('autofillProfile');
  for (const element of form.elements) {
    if (element.name && Object.hasOwn(autofillProfile, element.name)) {
      element.value = autofillProfile[element.name] ?? '';
    }
  }

  let educations = Array.isArray(autofillProfile.educations) ? autofillProfile.educations : [];
  if (!educations.length && autofillProfile.school) {
    educations = [{
      ...blankEducation(),
      school: autofillProfile.school,
      degree: autofillProfile.degree || '',
      major: autofillProfile.major || '',
      endDate: autofillProfile.graduationDate || ''
    }];
  }
  while (educations.length < 2) educations.push(blankEducation());
  educations.forEach(addEducation);
}

addEducationBtn.addEventListener('click', () => addEducation());

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profile = Object.fromEntries(new FormData(form).entries());
  profile.educations = collectEducations();

  const firstEducation = profile.educations[0] || blankEducation();
  profile.school = firstEducation.school;
  profile.degree = firstEducation.degree;
  profile.major = firstEducation.major;
  profile.graduationDate = firstEducation.endDate;

  await chrome.storage.local.set({ autofillProfile: profile });
  saveStatus.textContent = `✓ 已保存 ${profile.educations.length} 段教育经历`;
  window.setTimeout(() => { saveStatus.textContent = ''; }, 2600);
});

loadProfile();
