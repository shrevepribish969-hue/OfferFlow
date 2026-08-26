"use client";
import React, { useState, useRef } from 'react';
import { Edit2, Save, Image as ImageIcon, FileText, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

export interface ResumeData {
  personal_info?: {
    name?: string;
    contact?: string;
    job_intention?: string;
    availability?: string;
    preferred_locations?: string[];
    summary?: string;
  };
  personal_strengths?: string[];
  education?: {
    school?: string;
    degree?: string;
    date?: string;
    major?: string;
  }[];
  work_experience?: {
    company?: string;
    role?: string;
    date?: string;
    descriptions?: string[];
  }[];
  project_experience?: {
    project?: string;
    role?: string;
    date?: string;
    descriptions?: string[];
  }[];
  campus_experience?: {
    organization?: string;
    role?: string;
    date?: string;
    descriptions?: string[];
  }[];
  skills?: string[];
  awards_certificates?: string[];
  custom_sections?: {
    section_title?: string;
    section_type?: string;
    items?: {
      title?: string;
      organization?: string;
      role?: string;
      date?: string;
      descriptions?: string[];
    }[];
  }[];
  document_notes?: string[];
  others?: string[];
}

interface ResumeViewerProps {
  data: ResumeData | null;
}

export const ResumeViewer: React.FC<ResumeViewerProps> = ({ data }) => {
  const [isEditing, setIsEditing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadImage = async () => {
    if (!containerRef.current) return;
    try {
      setIsExporting(true);
      // Wait for font loading and rendering to settle
      await new Promise(r => setTimeout(r, 100));
      const dataUrl = await toPng(containerRef.current, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        style: { margin: '0' },
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight
      });
      const link = document.createElement('a');
      link.download = '我的简历.png';
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export image failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!containerRef.current) return;
    try {
      setIsExporting(true);
      await new Promise(r => setTimeout(r, 100));
      const dataUrl = await toPng(containerRef.current, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        style: { margin: '0' },
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('我的简历.pdf');
    } catch (err) {
      console.error('Export PDF failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        无可用简历数据
      </div>
    );
  }

  const {
    personal_info,
    education,
    personal_strengths,
    skills,
    awards_certificates,
    custom_sections,
    others,
  } = data;

  const sortedWork = data.work_experience ? [...data.work_experience].sort((a, b) => (b.date || "").localeCompare(a.date || "")) : [];
  const sortedProject = data.project_experience ? [...data.project_experience].sort((a, b) => (b.date || "").localeCompare(a.date || "")) : [];
  const sortedCampus = data.campus_experience ? [...data.campus_experience].sort((a, b) => (b.date || "").localeCompare(a.date || "")) : [];

  const renderBullet = (text: string) => {
    const match = text.match(/^(.*?[:：])(.*)$/);
    if (match) {
      return (
        <span className="flex-1 text-justify">
          <span className="font-bold">{match[1]}</span>
          {match[2]}
        </span>
      );
    }
    return <span className="flex-1 text-justify">{text}</span>;
  };

  return (
    <div className="relative group">
      {/* Floating Action Buttons */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition no-print">
        <button
          onClick={handleDownloadPDF}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full text-xs font-semibold shadow-sm border border-slate-200 transition disabled:opacity-50"
        >
          {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} 存为 PDF
        </button>
        <button
          onClick={handleDownloadImage}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full text-xs font-semibold shadow-sm border border-slate-200 transition disabled:opacity-50"
        >
          {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />} 存为长图
        </button>
        <button
          onClick={() => setIsEditing(!isEditing)}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-full text-xs font-semibold shadow-sm border border-indigo-100 transition disabled:opacity-50"
        >
          {isEditing ? (
            <><Save className="w-3.5 h-3.5" /> 保存修改</>
          ) : (
            <><Edit2 className="w-3.5 h-3.5" /> 开启编辑</>
          )}
        </button>
      </div>

      <div 
        id="resume-container"
        ref={containerRef}
        contentEditable={isEditing} 
        suppressContentEditableWarning={true}
        className={`bg-white text-black py-6 px-8 shadow-sm border border-gray-200 w-full max-w-[800px] min-h-[1050px] mx-auto font-sans leading-snug text-[12px] box-border relative overflow-visible transition-all ${isEditing ? 'ring-2 ring-indigo-400 ring-offset-2 outline-none' : ''}`}
      >
        {/* A4 Page Cut Line Indicator */}
        <div className="absolute top-0 left-0 w-full pointer-events-none no-print z-20 border-b-2 border-dashed border-red-300/60" style={{ aspectRatio: '1 / 1.4142' }}>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[10px] tracking-widest font-bold text-red-400/80 bg-white px-3">A4 分页警戒线</div>
        </div>
      {/* Header: Personal Info */}
      <div className="text-center mb-3">
        <h1 className="text-xl font-black tracking-widest mb-1">{personal_info?.name || "姓名"}</h1>
        <p className="text-[11px] text-gray-800">{personal_info?.contact || "联系方式"}</p>
        {personal_info?.summary && (
          <p className="text-[11px] mt-1 text-left text-gray-800">{personal_info.summary}</p>
        )}
        {(personal_info?.job_intention || personal_info?.availability || (personal_info?.preferred_locations?.length || 0) > 0) && (
          <p className="text-[11px] mt-1 text-gray-800">
            {personal_info.job_intention && <span>求职意向：{personal_info.job_intention}</span>}
            {personal_info.availability && <span> | 到岗时间：{personal_info.availability}</span>}
            {(personal_info.preferred_locations?.length || 0) > 0 && <span> | 期望地点：{personal_info.preferred_locations?.join(" / ")}</span>}
          </p>
        )}
      </div>

      {personal_strengths && personal_strengths.length > 0 && (
        <div className="mb-2">
          <h2 className="text-[13px] font-bold tracking-wider mb-1">个人优势</h2>
          <div className="w-full h-[1.5px] bg-black mb-1"></div>
          <ul className="list-none text-[11px] text-gray-900 space-y-0.5">
            {personal_strengths.map((item, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-black font-bold">▪</span>
                {renderBullet(item)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Education */}
      {education && education.length > 0 && (
        <div className="mb-2">
          <h2 className="text-[13px] font-bold tracking-wider mb-1">教育经历</h2>
          <div className="w-full h-[1.5px] bg-black mb-1"></div>
          {education.map((edu, idx) => (
            <div key={idx} className="mb-1">
              <div className="flex justify-between font-bold">
                <span>{edu.school}</span>
                <span>{edu.date}</span>
              </div>
              <div className="flex justify-between text-[11px] mt-0.5">
                <span className="font-semibold">{edu.degree} {edu.major ? `| ${edu.major}` : ""}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Work Experience */}
      {sortedWork.length > 0 && (
        <div className="mb-2">
          <h2 className="text-[13px] font-bold tracking-wider mb-1">工作经历</h2>
          <div className="w-full h-[1.5px] bg-black mb-1"></div>
          {sortedWork.map((exp, idx) => (
            <div key={idx} className="mb-1.5">
              <div className="flex justify-between font-bold">
                <span>{exp.company}</span>
                <span>{exp.date}</span>
              </div>
              <div className="text-[11px] font-semibold mt-0.5 mb-0.5">{exp.role}</div>
              {exp.descriptions && exp.descriptions.length > 0 && (
                <ul className="list-none text-[11px] text-gray-900 space-y-0.5">
                  {exp.descriptions.map((desc, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-black font-bold">▪</span>
                      {renderBullet(desc)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Project Experience */}
      {sortedProject.length > 0 && (
        <div className="mb-2">
          <h2 className="text-[13px] font-bold tracking-wider mb-1">项目经历</h2>
          <div className="w-full h-[1.5px] bg-black mb-1"></div>
          {sortedProject.map((proj, idx) => (
            <div key={idx} className="mb-1.5">
              <div className="flex justify-between font-bold">
                <span>{proj.project}</span>
                <span>{proj.date}</span>
              </div>
              <div className="text-[11px] font-semibold mt-0.5 mb-0.5">{proj.role}</div>
              {proj.descriptions && proj.descriptions.length > 0 && (
                <ul className="list-none text-[11px] text-gray-900 space-y-0.5">
                  {proj.descriptions.map((desc, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-black font-bold">▪</span>
                      {renderBullet(desc)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Campus Experience */}
      {sortedCampus.length > 0 && (
        <div className="mb-2">
          <h2 className="text-[13px] font-bold tracking-wider mb-1">校园经历</h2>
          <div className="w-full h-[1.5px] bg-black mb-1"></div>
          {sortedCampus.map((exp, idx) => (
            <div key={idx} className="mb-1.5">
              <div className="flex justify-between font-bold">
                <span>{exp.organization}</span>
                <span>{exp.date}</span>
              </div>
              <div className="text-[11px] font-semibold mt-0.5 mb-0.5">{exp.role}</div>
              {exp.descriptions && exp.descriptions.length > 0 && (
                <ul className="list-none text-[11px] text-gray-900 space-y-0.5">
                  {exp.descriptions.map((desc, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-black font-bold">▪</span>
                      {renderBullet(desc)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Skills */}
      {skills && skills.length > 0 && (
        <div className="mb-2">
          <h2 className="text-[13px] font-bold tracking-wider mb-1">专业技能</h2>
          <div className="w-full h-[1.5px] bg-black mb-1"></div>
          <div className="text-[11px] text-gray-900 leading-relaxed text-justify">
            <span className="font-bold">相关技能：</span>
            <span>
              {skills.map(s => s.replace(/[,，:：]/g, ' ')).join('、')}
            </span>
          </div>
        </div>
      )}

      {/* Others */}
      {awards_certificates && awards_certificates.length > 0 && (
        <div className="mb-2">
          <h2 className="text-[13px] font-bold tracking-wider mb-1">奖项证书</h2>
          <div className="w-full h-[1.5px] bg-black mb-1"></div>
          <div className="text-[11px] text-gray-900 leading-relaxed text-justify">
            <span>{awards_certificates.join('、')}</span>
          </div>
        </div>
      )}

      {custom_sections && custom_sections.length > 0 && (
        <div className="mb-2">
          {custom_sections.map((section, idx) => (
            <div key={idx} className="mb-2">
              <h2 className="text-[13px] font-bold tracking-wider mb-1">{section.section_title || "其他经历"}</h2>
              <div className="w-full h-[1.5px] bg-black mb-1"></div>
              {(section.items || []).map((item, itemIdx) => (
                <div key={itemIdx} className="mb-1.5">
                  {(item.title || item.organization || item.date) && (
                    <div className="flex justify-between font-bold">
                      <span>{item.title || item.organization}</span>
                      <span>{item.date}</span>
                    </div>
                  )}
                  {item.role && <div className="text-[11px] font-semibold mt-0.5 mb-0.5">{item.role}</div>}
                  {(item.descriptions || []).map((desc, i) => (
                    <div key={i} className="flex gap-1.5 text-[11px] text-gray-900">
                      <span className="text-black font-bold">▪</span>
                      {renderBullet(desc)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {others && others.length > 0 && (
        <div className="mb-2">
          <h2 className="text-[13px] font-bold tracking-wider mb-1">荣誉及其他</h2>
          <div className="w-full h-[1.5px] bg-black mb-1"></div>
          <div className="text-[11px] text-gray-900 leading-relaxed text-justify">
            <span className="font-bold">所获荣誉：</span>
            <span>
              {others.map(o => o.replace(/[,，:：]/g, ' ')).join('、')}
            </span>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
