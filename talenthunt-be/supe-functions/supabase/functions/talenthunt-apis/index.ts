// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.46.2"
import axios from "npm:axios"

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!)

console.log('starting gthe functions')
// ... existing imports ...

const generateProfileSummary = async (profile_url: string, job_description: string, profile_id: number, role_id: number) => {
  try {
    console.log('in generateProfileSummary')
    const response = await axios.post('https://hrtick-production.up.railway.app/match_resume_to_job', {
      resume_url: profile_url,
      jd: job_description
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const responseData = response?.data;

    console.log("responseData for profile summary", responseData)

    const red_flags = { "high": responseData.red_flags["1"], "medium": responseData.red_flags["2"], "low": responseData.red_flags["3"] }

    const profile_update_payload = {
      score: responseData.score,
      match_reasons: responseData.match_reasons,
      red_flags: red_flags
    };
    await supabase
      .from('Profile')
      .update(profile_update_payload)
      .eq('id', profile_id)
      .eq('role_id', role_id)
      .select()
      .single()


  } catch (error) {
    console.error('Error generating profile summary:', error);
    throw error;
  }
}

const generateRoleQuestions = async (job_description: string, role_id: number) => {
  const response = await axios.post('https://hrtick-production.up.railway.app/generate_role_questions', {
    jd: job_description
  }, {
    headers: {
      'Content-Type': 'application/json'
    }
  });

  console.log('response for geenrate role questions', response?.data)
  if (!response?.data?.questions) {
    return
  }
  await supabase
    .from('RoleScreenQuestions')
    .insert([{
      role_id,
      questions: response?.data?.questions
    }])
    .select()
    .single()
}

const generateProfileSpecificQuestions = async (profile_url: string, job_description: string, role_id: number, profile_id: number) => {
  console.log('in generateProfileSpecificQuestions')
  const response = await axios.post('https://hrtick-production.up.railway.app/generate_candidate_questions', {
    resume_url: profile_url,
    jd: job_description
  }, {
    headers: {
      'Content-Type': 'application/json'
    }
  });

  console.log("response for generate candidate questions", response?.data)

  if (!response?.data?.questions) {
    return
  }
  await supabase
    .from('ProfileScreenQuestions')
    .insert([{
      role_id,
      profile_id,
      questions: response?.data?.questions
    }])
    .select()
    .single()

  return response?.data?.questions
}

const parseProfileData = async (profile_url: string, profile_id: number) => {
  const response = await axios.post('https://hrtick-production.up.railway.app/extract_candidate_profile', {
    url: profile_url,
  }, {
    headers: {
      'Content-Type': 'application/json'
    }
  });

  console.log("response for parse profile data", response?.data)

  const profileSummary = {
    pi: response?.data["Personal Information"],
    work_history: response?.data["Work History"],
    projects: response?.data["Projects"],
    education: response?.data["Education"],
    skills: response?.data["Skills"],
    profile_id
  }
  // console.log("profile summary", profileSummary)
  const { data, error } = await supabase
    .from('ProfileSummary')
    .insert([profileSummary])
    .select()
    .single()

  const profileUploadPayload = {
    name: response?.data["Personal Information"]?.Name,
    email: response?.data["Personal Information"]?.Email
  }
  console.log("profileUploadPayload", profileUploadPayload)
  const { data: _profile, error: profileError } = await supabase
    .from('Profile')
    .update(profileUploadPayload)
    .eq('id', profile_id)
    .select()
    .single()
  console.log('_profile', _profile)
  if (error || profileError) {
    console.error('Error inserting profile summary:', error)
    return null
  }

  return data

}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  try {

    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        }
      })
    }
    const { requestType, role, profile, role_id, profile_id, profile_summary, profile_url, assessment, questions, score, assessment_score } = await req.json()

    switch (requestType) {
      case 'getRoles': {
        const { data: roles, error: getRolesError } = await supabase
          .from('Role')
          .select('*')

        if (getRolesError) {
          return new Response(
            JSON.stringify({ error: getRolesError.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        return new Response(
          JSON.stringify(roles),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }


      case 'createRole': {
        if (!role?.name || !role?.job_description) {
          return new Response(
            JSON.stringify({ error: "Name and job description are required" }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        const { data: newRole, error: createError } = await supabase
          .from('Role')
          .insert([role])
          .select()
          .single()



        if (createError) {
          return new Response(
            JSON.stringify({ error: createError.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        await generateRoleQuestions(role.job_description, newRole.id)

        return new Response(
          JSON.stringify(newRole),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      case 'getProfiles': {
        if (!role_id) {
          return new Response(
            JSON.stringify({ error: "role id is required" }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        const { data: roles, error: getRolesError } = await supabase
          .from('Profile')
          .select('*')
          .eq('role_id', role_id)

        if (getRolesError) {
          return new Response(
            JSON.stringify({ error: getRolesError.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        return new Response(
          JSON.stringify(roles),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      case 'createProfile': {
        if (!profile?.role_id || !profile?.profile_url) {
          return new Response(
            JSON.stringify({ error: "role id and profile url are required" }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        const { data: newProfile, error: createError } = await supabase
          .from('Profile')
          .insert([profile])
          .select()
          .single()

        if (createError) {
          return new Response(
            JSON.stringify({ error: createError.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        const { data: role, error: getRolesError } = await supabase
          .from('Role')
          .select('*')
          .eq('id', profile.role_id)

        if (role && role.length > 0) {
          console.log('test', profile.profile_url, role[0].job_description, newProfile.id, profile.role_id)
          await generateProfileSummary(profile.profile_url, role[0].job_description, newProfile.id, profile.role_id)
          await parseProfileData(profile.profile_url, newProfile.id)
        }

        return new Response(
          JSON.stringify({ newProfile, role }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )

      }

      case 'getSignedUrl': {
        const { data, error } = await supabase.storage.from('hackathon').createSignedUploadUrl(`${role_id}/${Date.now()}`);
        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }
        return new Response(
          JSON.stringify(data),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      case 'getProfileSummary': {
        if (!profile_id) {
          return new Response(
            JSON.stringify({ error: "profile id is required" }),
            { headers: { "Content-Type": "application/json" }, status: 400 }
          )
        }
        const numericProfileId = typeof profile_id === 'string' ? parseInt(profile_id) : profile_id;
        const { data, error } = await supabase.from('ProfileSummary').select('*').eq('profile_id', numericProfileId)

        if (error) {
          console.error('Supabase error:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }
        return new Response(
          JSON.stringify(data),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      case 'createProfileSummary': {
        if (!profile_summary?.profile_id || !profile_summary?.pi || !profile_summary?.work_history || !profile_summary.education) {
          return new Response(
            JSON.stringify({ error: "profile id, pi, work_history, projects and education are required" }),
            { headers: { "Content-Type": "application/json" }, status: 400 }
          )
        }
        const { data, error } = await supabase.from('ProfileSummary').insert([profile_summary]).select('*').single();

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        return new Response(
          JSON.stringify(data),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      case 'createProfileQuestions': {
        console.log("in createProfileQuestions")
        if (!profile_id || !role_id) {
          return new Response(
            JSON.stringify({ error: "profile_id, role_id and questions are required" }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }
        console.log("profile_id", profile_id)
        console.log("role_id", role_id)

        const { data: profileQues, error: _profileQuesError } = await supabase
          .from('ProfileScreenQuestions')
          .select('*')
          .eq("profile_id", profile_id)
          .eq("role_id", role_id)
        console.log("profileQues", profileQues)
        console.log("_adasas", _profileQuesError)
        if (profileQues && profileQues.length > 0) {
          return new Response(
            JSON.stringify({ questions: profileQues[0]?.questions }),
            { headers: { "Content-Type": "application/json", ...corsHeaders } }
          )
        }
        const { data: profile, error: _profileError } = await supabase.from("Profile").select('*').eq('id', profile_id)
        const { data: role, error: _roleError } = await supabase.from("Role").select('*').eq('id', role_id)
        const questions = await generateProfileSpecificQuestions(profile[0].profile_url, role[0].job_description, role_id, profile_id)

        return new Response(
          JSON.stringify({ questions }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      case 'getProfileQuestions': {
        const { profile_id, role_id } = await req.json();
        if (!profile_id || !role_id) {
          return new Response(
            JSON.stringify({ error: "profile id and role id are required" }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        const numericProfileId = typeof profile_id === 'string' ? parseInt(profile_id) : profile_id;
        const numericRoleId = typeof role_id === 'string' ? parseInt(role_id) : role_id;

        const { data, error } = await supabase
          .from('ProfileScreenQuestions')
          .select('*')
          .eq('profile_id', numericProfileId)
          .eq('role_id', numericRoleId)
          .single()

        if (error) {
          console.error('Supabase error:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        return new Response(
          JSON.stringify(data),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }


      case 'getRoleQuestions': {
        if (!role_id) {
          return new Response(
            JSON.stringify({ error: "role id is required" }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        const numericRoleId = typeof role_id === 'string' ? parseInt(role_id) : role_id;

        const { data, error } = await supabase
          .from('RoleScreenQuestions')
          .select('*')
          .eq('role_id', numericRoleId)
          .single()

        if (error) {
          console.error('Supabase error:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        return new Response(
          JSON.stringify(data),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      case 'createCustomQuestions': {
        // const { questions } = await req.json();

        if (!role_id || !questions) {
          return new Response(
            JSON.stringify({ error: "role_id and questions are required" }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        console.log("in createCustomQuestions")

        const { data: customRoleQuestions, error: _customRoleQuestionsError } = await supabase
        .from('CustomRoleScreenQuestions')
        .select('*')
        .eq("role_id", role_id)

        console.log('customRoleQuestions', customRoleQuestions)
        console.log('_customRoleQuestionsError', _customRoleQuestionsError)

        let questionData, questError;
        if (customRoleQuestions && customRoleQuestions.length > 0) {
          
          ({ questionData, questError } = await supabase
            .from('CustomRoleScreenQuestions')
            .update({ questions })
            .eq('role_id', role_id)
            .select()
            .single())
        } else {
          // Insert new questions
          ({ questionData, questError } = await supabase
            .from('CustomRoleScreenQuestions')
            .insert([{
              role_id,
              questions
            }])
            .select()
            .single())
        }

        if (questError) {
          console.error('Supabase error:', questError);
          return new Response(
            JSON.stringify({ error: questError.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        return new Response(
          JSON.stringify(questionData),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      case 'getAllQuestions': {

        if (!profile_id || !role_id) {
          return new Response(
            JSON.stringify({ error: "profile id and role id are required" }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        const numericProfileId = typeof profile_id === 'string' ? parseInt(profile_id) : profile_id;
        const numericRoleId = typeof role_id === 'string' ? parseInt(role_id) : role_id;

        const [profileQuestionsResult, roleQuestionsResult, customQuestionsResult] = await Promise.all([
          supabase
            .from('ProfileScreenQuestions')
            .select('questions')
            .eq('profile_id', numericProfileId)
            .eq('role_id', numericRoleId)
            .single(),
          supabase
            .from('RoleScreenQuestions')
            .select('questions')
            .eq('role_id', numericRoleId)
            .single(),
          supabase
          .from('CustomRoleScreenQuestions')
          .select('questions')
          .eq('role_id', numericRoleId)
          .single()
        ]);

        const error = profileQuestionsResult.error?.message || roleQuestionsResult.error?.message || customQuestionsResult.error?.message

        const response = {
          profileQuestions: profileQuestionsResult.data?.questions || null,
          roleQuestions: roleQuestionsResult.data?.questions || null,
          customQuestions: customQuestionsResult.data?.questions || null,
          errors: error
        };

        return new Response(
          JSON.stringify(response),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      case 'updateProfileSummary': {
        if (!profile_summary?.profile_id || !profile_summary?.role_id) {
          return new Response(
            JSON.stringify({ error: "profile id and role id is required" }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        const { data, error } = await supabase
          .from('ProfileSummary')
          .update(profile_summary)
          .eq('profile_id', profile_summary.profile_id)
          .eq('role_id', profile_summary.role_id)
          .select()
          .single()

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }

        return new Response(
          JSON.stringify(data),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      case 'generateProfileSumamry': {
        console.log("prof", profile_url)
        const data = await parseProfileData(profile_url, 18)
        console.log("data", data)
        return new Response(
          JSON.stringify(data),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      case 'saveAssessment': {
        if (!profile_id || !role_id || !assessment) {
          return new Response(
            JSON.stringify({ error: "assessment, profile id and role id is required" }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }
        const { data, error } = await supabase
          .from('Assessments')
          .insert([{ assessment, role_id, profile_id }])
          .select()
          .single()

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }
        return new Response(
          JSON.stringify(data),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      case 'updateScore': {
        if (!profile_id || assessment_score === undefined) {
          return new Response(
            JSON.stringify({ error: "profile_id, role_id and score are required" }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }
      
        const { data, error } = await supabase
          .from('Profile')
          .update({ assessment_score })
          .eq('id', profile_id)
          .select()
          .single()
      
        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }
      
        return new Response(
          JSON.stringify(data),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      case 'getAssessment': {
        if (!profile_id || !role_id) {
          return new Response(
            JSON.stringify({ error: "profile id and role id are required" }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }
      
        const numericProfileId = typeof profile_id === 'string' ? parseInt(profile_id) : profile_id;
        const numericRoleId = typeof role_id === 'string' ? parseInt(role_id) : role_id;
      
        const { data, error } = await supabase
          .from('Assessments')
          .select('*')
          .eq('profile_id', numericProfileId)
          .eq('role_id', numericRoleId)
          .single()
      
        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
          )
        }
      
        return new Response(
          JSON.stringify(data),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid request type" }),
          { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 400 }
        )
    }
  } catch (_error) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 500 }
    )
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/talenthunt-apis' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
