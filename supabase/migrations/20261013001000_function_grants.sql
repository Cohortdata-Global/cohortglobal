-- =============================================================================
-- CohortGlobal — 1000 Who may call which function
-- =============================================================================

-- Nobody gets functions by default.
revoke execute on all functions in schema public from public, anon, authenticated;

-- System operations (service role only; docs/architecture.md 6.4).
grant execute on function
  public.sync_clerk_user(text, text, text, text),
  public.mark_clerk_user_deleted(text),
  public.bootstrap_super_admin(text),
  public.preview_invitation(text)
to service_role;

-- Signed-in users. Each function checks permissions itself.
grant execute on function
  public.get_my_context(),
  public.update_my_profile(jsonb),
  public.complete_freelancer_onboarding(jsonb),
  public.submit_agency_application(jsonb),
  public.register_agency_document(uuid, text, text, text, text, text, bigint, uuid),
  public.remove_agency_document(uuid),
  public.create_invitation(text, text, uuid, text, text, text),
  public.resend_invitation(uuid),
  public.revoke_invitation(uuid),
  public.accept_invitation(text),
  public.decide_agency(uuid, text, text),
  public.set_agency_status(uuid, text, text),
  public.admin_update_agency(uuid, jsonb),
  public.request_agency_change(text, jsonb, text),
  public.cancel_agency_request(uuid),
  public.decide_agency_request(uuid, boolean, text),
  public.admin_transfer_ownership(uuid, uuid, text, text),
  public.remove_member(uuid, text),
  public.set_member_status(uuid, text, text),
  public.revoke_staff_access(uuid, text),
  public.set_staff_role(uuid, text),
  public.mark_notifications_read(uuid[]),
  public.create_project(jsonb),
  public.update_project(uuid, jsonb),
  public.set_project_status(uuid, text, text),
  public.save_project_questions(uuid, jsonb),
  public.save_contract_template(uuid, text, text),
  public.invite_agency_to_project(uuid, uuid, text),
  public.submit_application(uuid, jsonb),
  public.withdraw_application(uuid),
  public.decide_application(uuid, boolean, text),
  public.sign_contract(uuid, text, text, text),
  public.countersign_contract(uuid, text, text, text),
  public.revoke_assignment(uuid, text),
  public.assign_member(uuid, uuid),
  public.unassign_member(uuid)
to authenticated;

-- The service role may also run user-facing functions on behalf of the server when needed.
grant execute on all functions in schema public to service_role;
