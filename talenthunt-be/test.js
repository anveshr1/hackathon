const axios = require('axios');
const generateProfileSummary = async (profile_url, job_description, profile_id, role_id) => {
    try {
        const response = await axios.post('https://hrtick-production.up.railway.app/match_resume_to_job', {
            resume_url: profile_url,
            jd: job_description
          }, {
            headers: {
              'Content-Type': 'application/json'
            }
          });
      
          const data = response.data;
  
          console.log(data)
    //   const red_flags = { "high": data.red_flags["1"], "medium": data.red_flags["2"], "low": data.red_flags["3"] }
    //   const profile_update_payload = {
    //     match_score: data.score,
    //     match_reasons: data.match_reasons,
    //     red_flags: red_flags
    //   };

    //   console.log(profile_update_payload)
    //   await supabase
    //     .from('Profile')
    //     .update(profile_update_payload)
    //     .eq('profile_id', profile_id)
    //     .eq('role_id', role_id)
    //     .select()
    //     .single()
  
  
    } catch (error) {
      console.error('Error generating profile summary:', error);
      throw error;
    }
  }

  const jd = "We're hiring a Frontend Developer!    At our company, we're focused on developing cutting-edge B2E AI solutions, with a strong emphasis on asynchronous collaboration using GitHub and Slack, and weekly syncs.    Who are we looking for?  A frontend developer to spearhead the creation of a modern web application, handle the UI independently, and work closely with a small team to bring the entire product to life.    Our Tech Stack:  - React & Redux with TypeScript (Feature-Sliced Design)  - Tailwind CSS  - Shadcn's UI components  - Cursor AI  - React Router  - Vite    The Ideal Candidate:  - Has a sharp eye for detail and values well-crafted UI.  - Proven experience delivering features with React and TypeScript in product environments.  - Understands the bigger picture—focusing on features and user journeys, not just code.  - Possesses a solid grasp of complex state management and its implications on the product.  - Works effectively with backend teams, participating in API design, spec reviews, and performance considerations.    Hiring Process:  - Submit your resume to [email]  - 1-on-1 pair programming interview with our lead developer  - Final meeting with the founders    Additional Information:  - Fully remote (preferable 5-6 hours overlap with EST/CEST)  - Paperwork and payments handled through Deel    If this sounds like you, we’d love to hear from you!"

  generateProfileSummary("https://tbtataojvhqyvlnzckwe.supabase.co/storage/v1/object/public/hackathon/1/Vinod-G-Resume-React.pdf?t=2024-11-29T13%3A17%3A53.349Z",
    jd,
    1, 1
  )