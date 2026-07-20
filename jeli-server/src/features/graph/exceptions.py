# Исключения фичи graph — наследники глобальных из src.exceptions.
from src.exceptions import ConflictError, NotFoundError, PermissionDeniedError


class PersonNotFoundError(NotFoundError):
    message = "Person not found"


class RelationshipNotFoundError(NotFoundError):
    message = "Relationship not found"


class MarriageProposalNotFoundError(NotFoundError):
    message = "Marriage proposal not found"


class MatchCandidateNotFoundError(NotFoundError):
    message = "Match candidate not found"


class NotPersonOwnerError(PermissionDeniedError):
    message = "You do not have edit rights over this person's graph"


class SelfRelationshipError(ConflictError):
    message = "A person cannot be related to themselves"


class TooManyParentsError(ConflictError):
    message = "This person already has two child_of parent edges"


class CyclicRelationshipError(ConflictError):
    message = "This relationship would create a cycle in the bloodline"


class DuplicateRelationshipError(ConflictError):
    message = "This relationship already exists"


class ProposalAlreadyResolvedError(ConflictError):
    message = "This marriage proposal is already resolved"


class NotProposalResponderError(PermissionDeniedError):
    message = "Only the owner (or collaborator) of the other person can confirm or reject this proposal"


class MatchAlreadyResolvedError(ConflictError):
    message = "This match candidate is already resolved by this side"


class NotMatchParticipantError(PermissionDeniedError):
    message = "You do not have edit rights over either side of this match candidate"


class SpouseRelationshipNotAllowedError(ConflictError):
    message = "Use POST /marriage-proposals to create a spouse_of relationship"


class CollaboratorAlreadyExistsError(ConflictError):
    message = "This user is already a collaborator on your graph"


class CollaboratorNotFoundError(NotFoundError):
    message = "Collaborator not found"


class AlreadyHasPersonError(ConflictError):
    message = "You already have a person node linked to your account"


class GenderRequiredError(ConflictError):
    message = "Set your gender in your profile before creating a family tree"


class InviteCodeNotFoundError(NotFoundError):
    message = "Invite code not found"


class DuplicateProposalError(ConflictError):
    message = "A pending marriage proposal already exists between these two persons"


class NoDirectRelationshipError(ConflictError):
    message = "No direct child_of relationship exists between these two persons"


class NotLinkedPersonError(ConflictError):
    message = "This person is not linked to a registered account"


class SuccessorRequiredError(ConflictError):
    message = "Choose a successor for your graph before removing your own person node"


class InvalidSuccessorError(ConflictError):
    message = "Selected successor is not a valid candidate"


class RelationshipTypeMismatchError(ConflictError):
    message = "Marriage fields (marriage_year, marriage_end_reason) only apply to spouse_of relationships"
